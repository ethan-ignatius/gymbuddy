"""
In-memory RAG store for health PDFs.

Chunks PDFs, embeds them via OpenAI, and stores vectors in a numpy array.
At query time, embeds the query and returns the top-k chunks by cosine
similarity.  No external vector database required.

Embeddings are cached to disk so PDFs are only re-embedded when they change.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

load_dotenv()

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None

_PDF_DIR = Path(__file__).resolve().parent / "health_pdfs"
_CACHE_PATH = _PDF_DIR / ".rag_cache.npz"
_MANIFEST_PATH = _PDF_DIR / ".rag_manifest.json"
_EMBEDDING_MODEL = "text-embedding-3-small"
_CHUNK_MAX = 1200
_CHUNK_OVERLAP = 200
_TOP_K = 4


def _chunk_text(text: str, max_chars: int = _CHUNK_MAX, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    chunks: list[str] = []
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


def _pdf_fingerprint(pdf_dir: Path) -> str:
    """Hash of all PDF filenames + sizes for cache invalidation."""
    parts: list[str] = []
    for p in sorted(pdf_dir.glob("*.pdf")):
        parts.append(f"{p.name}:{p.stat().st_size}")
    return hashlib.md5("|".join(parts).encode()).hexdigest()


class HealthRagStore:
    """Self-contained RAG store: index PDFs on first use, cache to disk."""

    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        self._openai = OpenAI(api_key=api_key) if (OpenAI and api_key) else None
        self._embeddings: np.ndarray | None = None
        self._chunks: list[dict] = []
        self._indexed = False

    @property
    def is_available(self) -> bool:
        return self._openai is not None and PdfReader is not None

    def _embed(self, texts: list[str]) -> np.ndarray:
        resp = self._openai.embeddings.create(
            model=_EMBEDDING_MODEL,
            input=texts,
        )
        return np.array([item.embedding for item in resp.data], dtype=np.float32)

    def _ensure_indexed(self) -> None:
        if self._indexed:
            return
        if not self.is_available:
            self._indexed = True
            return

        _PDF_DIR.mkdir(parents=True, exist_ok=True)
        pdf_files = sorted(_PDF_DIR.glob("*.pdf"))
        if not pdf_files:
            print("[rag] No PDFs found in health_pdfs/.")
            self._indexed = True
            return

        fingerprint = _pdf_fingerprint(_PDF_DIR)

        if _CACHE_PATH.exists() and _MANIFEST_PATH.exists():
            try:
                manifest = json.loads(_MANIFEST_PATH.read_text())
                if manifest.get("_fingerprint") == fingerprint:
                    data = np.load(str(_CACHE_PATH))
                    self._embeddings = data["embeddings"]
                    self._chunks = manifest.get("chunks", [])
                    self._indexed = True
                    print(f"[rag] Loaded {len(self._chunks)} cached chunks.")
                    return
            except Exception as exc:
                print(f"[rag] Cache load failed, re-indexing: {exc}")

        self._index_pdfs(pdf_files, fingerprint)
        self._indexed = True

    def _index_pdfs(self, pdf_files: list[Path], fingerprint: str) -> None:
        all_chunks: list[dict] = []
        all_texts: list[str] = []

        for pdf_path in pdf_files:
            reader = PdfReader(str(pdf_path))
            for page_no, page in enumerate(reader.pages, 1):
                text = page.extract_text() or ""
                if not text.strip():
                    continue
                for i, chunk in enumerate(_chunk_text(text)):
                    all_chunks.append({
                        "text": chunk,
                        "source": pdf_path.name,
                        "page": page_no,
                        "chunk": i,
                    })
                    all_texts.append(chunk)

        if not all_texts:
            print("[rag] No text extracted from PDFs.")
            return

        print(f"[rag] Embedding {len(all_texts)} chunks from {len(pdf_files)} PDF(s)...")
        batch_size = 100
        embeddings_list: list[np.ndarray] = []
        for start in range(0, len(all_texts), batch_size):
            batch = all_texts[start:start + batch_size]
            embeddings_list.append(self._embed(batch))

        self._embeddings = np.vstack(embeddings_list)
        self._chunks = all_chunks

        np.savez_compressed(str(_CACHE_PATH), embeddings=self._embeddings)
        manifest = {"_fingerprint": fingerprint, "chunks": all_chunks}
        _MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False))
        print(f"[rag] Indexed and cached {len(all_chunks)} chunks.")

    def search(self, query: str, top_k: int = _TOP_K) -> list[dict]:
        self._ensure_indexed()

        if self._embeddings is None or not self._chunks:
            return []

        try:
            query_vec = self._embed([query])[0]
            norms = np.linalg.norm(self._embeddings, axis=1)
            query_norm = np.linalg.norm(query_vec)
            scores = (self._embeddings @ query_vec) / (norms * query_norm + 1e-9)

            top_indices = np.argsort(scores)[-top_k:][::-1]
            return [self._chunks[i] for i in top_indices if scores[i] > 0.2]
        except Exception as exc:
            print(f"[rag] Search error: {exc}")
            return []


def build_rag_context(payloads: list[dict], max_chars: int = 2000) -> str:
    if not payloads:
        return ""
    parts: list[str] = []
    used = 0
    for p in payloads:
        text = (p.get("text") or "").strip()
        if not text:
            continue
        src = p.get("source", "unknown")
        page = p.get("page")
        label = f"[{src}, p.{page}]" if page else f"[{src}]"
        snippet = f"{label} {text}"
        if used + len(snippet) > max_chars:
            break
        parts.append(snippet)
        used += len(snippet)
    return "\n".join(parts)
