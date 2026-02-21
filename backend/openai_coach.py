"""
OpenAI-powered conversational coach for GymBuddy.

Used as a fallback for general questions or small talk.
"""

import os
import time

from dotenv import load_dotenv

from rag_store import HealthRagStore, build_context

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency
    OpenAI = None


load_dotenv()

SYSTEM_PROMPT = (
    "You are GymBuddy, a conversational workout coach. "
    "Be friendly, a little sassy, and concise. "
    "Keep the user moving and focused on form and safety. "
    "If the user asks unrelated questions, answer briefly and steer back to fitness. "
    "If Health docs are provided, ground your answer in them and cite sources inline. "
    "Avoid medical advice; suggest seeing a professional if asked about pain or injury. "
    "Use 1-3 sentences."
)

DEFAULT_MODEL = "gpt-4.1-mini"


class OpenAICoach:
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or OpenAI is None:
            if OpenAI is None:
                print("Warning: openai not installed; OpenAI coach disabled.")
            else:
                print("Warning: OPENAI_API_KEY not set; OpenAI coach disabled.")
            self._client = None
            self._model = None
            return

        self._client = OpenAI(api_key=api_key)
        self._model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
        self._last_call = 0.0
        self._rag = HealthRagStore()

    def reply(self, user_text: str, context: str | None = None) -> str | None:
        if not self._client or not user_text:
            return None

        now = time.time()
        # Basic rate limit to avoid spamming the API.
        if now - self._last_call < 1.0:
            return None
        self._last_call = now

        rag_context = ""
        payloads = []
        if self._rag.is_available:
            payloads = self._rag.search(user_text)
            rag_context = build_context(payloads)
            if payloads:
                sources = sorted({(p.get("source") or "unknown") for p in payloads})
                print(f"[rag] hits={len(payloads)} sources={sources}")
            elif _is_health_query(user_text):
                print("[rag] no hits for health query")

        ctx = f"Context: {context}\n" if context else ""
        doc_ctx = f"Health docs:\n{rag_context}\n" if rag_context else ""
        prompt = f"{SYSTEM_PROMPT}\n{doc_ctx}{ctx}User: {user_text}\nAssistant:"

        try:
            response = self._client.responses.create(
                model=self._model,
                input=prompt,
            )
            text = response.output_text or ""
            text = text.strip()
            return text or None
        except Exception as exc:
            print(f"OpenAI coach error: {exc}")
            return None


def _is_health_query(text: str) -> bool:
    lowered = text.lower()
    keywords = [
        "pain", "injury", "injured", "sore", "strain", "sprain",
        "health", "medical", "doctor", "therapy", "rehab",
        "diet", "nutrition", "calories", "protein", "sleep",
        "heart", "blood pressure", "asthma", "diabetes",
        "warm up", "cool down", "stretch",
    ]
    return any(k in lowered for k in keywords)
