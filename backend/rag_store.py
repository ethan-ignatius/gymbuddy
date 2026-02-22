"""
RAG utilities for indexing and retrieving health PDFs with Actian VectorAI DB.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency
    OpenAI = None

try:
    from cortex import CortexClient, DistanceMetric
except Exception:  # pragma: no cover - optional dependency
    CortexClient = None
    DistanceMetric = None

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency
    PdfReader = None


_BACKEND_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _BACKEND_DIR.parent
# Load env from both backend/.env and repo-root/.env so scripts work from either cwd.
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_ROOT_DIR / ".env")


@dataclass
class RagConfig:
    endpoint: str
    collection: str
    pdf_dir: Path
    top_k: int
    embedding_model: str
    manifest_path: Path


def _resolve_pdf_dir(raw_dir: str | None) -> Path:
    base = Path(__file__).resolve().parent
    if not raw_dir:
        return base / "health_pdfs"
    p = Path(raw_dir)
    if not p.is_absolute():
        p = base / p
    return p


def load_config() -> RagConfig:
    pdf_dir = _resolve_pdf_dir(os.getenv("RAG_PDF_DIR", "health_pdfs"))
    return RagConfig(
        endpoint=os.getenv("ACTIAN_ENDPOINT", "localhost:50051"),
        collection=os.getenv("RAG_COLLECTION", "health_docs"),
        pdf_dir=pdf_dir,
        top_k=int(os.getenv("RAG_TOP_K", "4")),
        embedding_model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        manifest_path=pdf_dir / ".rag_manifest.json",
    )


def _chunk_text(text: str, max_chars: int = 1200, overlap: int = 200) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = max(0, end - overlap)
        if end == len(text):
            break
    return chunks


def _iter_pdf_texts(pdf_path: Path) -> Iterable[tuple[int, str]]:
    if PdfReader is None:
        raise RuntimeError("pypdf not installed. Install it to parse PDFs.")
    reader = PdfReader(str(pdf_path))
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            yield i + 1, text


class HealthRagStore:
    def __init__(self) -> None:
        self._cfg = load_config()
        self._openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY")) if OpenAI else None
        self._manifest_cache: dict[str, dict] | None = None

    @property
    def is_available(self) -> bool:
        return (
            self._openai is not None
            and CortexClient is not None
            and DistanceMetric is not None
        )

    def diagnostics(self) -> dict[str, str | bool | int]:
        info: dict[str, str | bool | int] = {
            "openai_client": self._openai is not None,
            "cortex_client": CortexClient is not None,
            "distance_metric": DistanceMetric is not None,
            "pdf_reader": PdfReader is not None,
            "endpoint": self._cfg.endpoint,
            "collection": self._cfg.collection,
            "pdf_dir": str(self._cfg.pdf_dir),
            "manifest_path": str(self._cfg.manifest_path),
        }
        if not self.is_available:
            return info
        try:
            with CortexClient(self._cfg.endpoint) as client:
                exists = client.collection_exists(self._cfg.collection)
                info["collection_exists"] = exists
                info["collection_count"] = client.count(self._cfg.collection) if exists else 0
        except Exception as exc:
            info["db_error"] = str(exc)
        return info

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not self._openai:
            raise RuntimeError("OpenAI client not available.")
        resp = self._openai.embeddings.create(
            model=self._cfg.embedding_model,
            input=texts,
        )
        return [item.embedding for item in resp.data]

    def _ensure_collection(self, client: "CortexClient", dim: int) -> None:
        if client.collection_exists(self._cfg.collection):
            return
        client.create_collection(
            name=self._cfg.collection,
            dimension=dim,
            distance_metric=DistanceMetric.COSINE,
        )

    def index_pdfs(self) -> int:
        if not self.is_available or PdfReader is None:
            raise RuntimeError("RAG dependencies missing. Check requirements and API keys.")

        pdf_dir = self._cfg.pdf_dir
        pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_paths = sorted(p for p in pdf_dir.glob("*.pdf") if p.is_file())
        if not pdf_paths:
            return 0

        total_chunks = 0
        manifest: dict[str, dict] = {}
        with CortexClient(self._cfg.endpoint) as client:
            for pdf_path in pdf_paths:
                base_id = int(hashlib.md5(str(pdf_path).encode()).hexdigest()[:8], 16)
                for page_no, page_text in _iter_pdf_texts(pdf_path):
                    chunks = _chunk_text(page_text)
                    if not chunks:
                        continue
                    vectors = self._embed(chunks)
                    if not vectors:
                        continue
                    self._ensure_collection(client, len(vectors[0]))
                    ids = [base_id * 10_000 + page_no * 100 + i for i in range(len(chunks))]
                    payloads = [
                        {
                            "text": chunk,
                            "source": pdf_path.name,
                            "page": page_no,
                            "chunk": i,
                        }
                        for i, chunk in enumerate(chunks)
                    ]
                    for idx, payload in zip(ids, payloads):
                        manifest[str(idx)] = payload
                    client.batch_upsert(
                        self._cfg.collection,
                        ids=ids,
                        vectors=vectors,
                        payloads=payloads,
                    )
                    total_chunks += len(chunks)
        self._cfg.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with self._cfg.manifest_path.open("w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=True)
        self._manifest_cache = manifest
        return total_chunks

    def search(self, query: str) -> list[dict]:
        if not self.is_available:
            return []
        try:
            vectors = self._embed([query])
            if not vectors:
                return []
            with CortexClient(self._cfg.endpoint) as client:
                results = client.search(
                    self._cfg.collection,
                    query=vectors[0],
                    top_k=self._cfg.top_k,
                    with_payload=True,
                )
                payloads: list[dict] = []
                missing_ids: list[int] = []
                for r in results:
                    payload = _extract_payload(r)
                    if isinstance(payload, dict):
                        payloads.append(payload)
                        continue
                    rid = _extract_id(r)
                    if rid is not None:
                        missing_ids.append(rid)

                # Some server/client combinations return payload=None in search results.
                # Hydrate payloads by ID so RAG context can still be built.
                for rid in missing_ids:
                    hydrated = _get_payload_by_id(client, self._cfg.collection, rid)
                    if hydrated is None:
                        hydrated = self._manifest_payload(rid)
                        if hydrated is not None:
                            print(f"[rag] hydrated payload from manifest for id={rid}")
                    if isinstance(hydrated, dict):
                        payloads.append(hydrated)
            if not payloads:
                print(
                    f"[rag] search returned {len(results)} result(s) but 0 usable payloads "
                    f"for collection='{self._cfg.collection}' endpoint='{self._cfg.endpoint}'"
                )
                if results:
                    sample = _result_debug(results[0])
                    print(f"[rag] sample_result={sample}")
            return payloads
        except Exception as exc:
            print(f"RAG search error: {exc}")
            return []

    def _manifest_payload(self, rid: int) -> dict | None:
        manifest = self._load_manifest()
        payload = manifest.get(str(rid))
        if isinstance(payload, dict):
            return payload
        return None

    def _load_manifest(self) -> dict[str, dict]:
        if self._manifest_cache is not None:
            return self._manifest_cache
        path = self._cfg.manifest_path
        if not path.exists():
            self._manifest_cache = {}
            return self._manifest_cache
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            self._manifest_cache = data if isinstance(data, dict) else {}
        except Exception as exc:
            print(f"[rag] failed to load manifest: {exc}")
            self._manifest_cache = {}
        return self._manifest_cache


def build_context(payloads: list[dict], max_chars: int = 2000) -> str:
    if not payloads:
        return ""
    parts = []
    used = 0
    for p in payloads:
        if not isinstance(p, dict):
            continue
        text = (p.get("text") or "").strip()
        if not text:
            continue
        src = p.get("source") or "unknown"
        page = p.get("page")
        label = f"[{src}, p.{page}]" if page else f"[{src}]"
        snippet = f"{label} {text}"
        if used + len(snippet) > max_chars:
            break
        parts.append(snippet)
        used += len(snippet)
    return "\n".join(parts)


def _extract_payload(result) -> dict | None:
    payload = getattr(result, "payload", None)
    if isinstance(payload, dict):
        return payload

    # Some client versions expose pydantic models.
    model_dump = getattr(result, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump()
            if isinstance(dumped, dict):
                maybe = dumped.get("payload")
                if isinstance(maybe, dict):
                    return maybe
        except Exception:
            return None
    return None


def _extract_id(result) -> int | None:
    rid = getattr(result, "id", None)
    if isinstance(rid, int):
        return rid
    model_dump = getattr(result, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump()
            val = dumped.get("id") if isinstance(dumped, dict) else None
            if isinstance(val, int):
                return val
        except Exception:
            return None
    return None


def _get_payload_by_id(client, collection: str, rid: int) -> dict | None:
    try:
        item = client.get(collection, rid)
    except Exception:
        return None
    # Actian get() returns (vector, payload)
    if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], dict):
        return item[1]
    return _extract_payload(item)


def _result_debug(result) -> dict:
    out: dict = {"type": type(result).__name__}
    out["has_payload_attr"] = hasattr(result, "payload")
    payload = getattr(result, "payload", None)
    out["payload_type"] = type(payload).__name__ if payload is not None else "None"
    model_dump = getattr(result, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump()
            if isinstance(dumped, dict):
                out["model_dump_keys"] = sorted(list(dumped.keys()))
        except Exception as exc:
            out["model_dump_error"] = str(exc)
    return out