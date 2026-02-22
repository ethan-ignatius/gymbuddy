"""
Index PDFs in health_pdfs into RAG (Actian VectorAI DB when available, else manifest-only).
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_store import HealthRagStore


def main() -> None:
    store = HealthRagStore()
    pdf_dir = store._cfg.pdf_dir
    print(f"PDF directory: {pdf_dir}")

    if store.is_available:
        print(f"Diagnostics before indexing: {store.diagnostics()}")
        count = store.index_pdfs()
        print(f"Indexed {count} chunks (Actian + manifest).")
        print(f"Diagnostics after indexing: {store.diagnostics()}")
    else:
        print("Actian/OpenAI not available. Building manifest-only (chat fallback will use token search).")
        print(f"Diagnostics: {store.diagnostics()}")
        count = store.index_pdfs_manifest_only()
        print(f"Indexed {count} chunks to {store._cfg.manifest_path}")


if __name__ == "__main__":
    main()