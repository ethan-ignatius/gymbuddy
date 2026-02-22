"""
Index PDFs in backend/health_pdfs into Actian VectorAI DB.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_store import HealthRagStore


def main() -> None:
    store = HealthRagStore()
    if not store.is_available:
        print("RAG dependencies missing. Install requirements and set OPENAI_API_KEY.")
        print(f"Diagnostics: {store.diagnostics()}")
        return

    print(f"Diagnostics before indexing: {store.diagnostics()}")
    count = store.index_pdfs()
    print(f"Indexed {count} chunks.")
    print(f"Diagnostics after indexing: {store.diagnostics()}")


if __name__ == "__main__":
    main()