import json
import sys
from pathlib import Path


def main() -> int:
    backend_dir = Path(__file__).resolve().parents[1]
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    try:
        from rag_store import HealthRagStore, build_context  # type: ignore
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"import_failed: {exc}"}))
        return 1

    query = " ".join(sys.argv[1:]).strip()
    if not query:
        print(json.dumps({"ok": False, "error": "query required"}))
        return 1

    store = HealthRagStore()
    diagnostics = store.diagnostics()
    payloads = store.search(query)
    context = build_context(payloads, max_chars=2400)

    hits = []
    for p in payloads:
        if not isinstance(p, dict):
            continue
        hits.append(
            {
                "source": p.get("source"),
                "page": p.get("page"),
                "chunk": p.get("chunk"),
            }
        )

    print(
        json.dumps(
            {
                "ok": True,
                "diagnostics": diagnostics,
                "hits": hits,
                "context": context,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

