"""
LLMBrain – OpenAI integration for natural conversation and smart command
recognition during workouts.

Uses gpt-4o-mini for low-latency intent classification and conversational
responses.  Falls back gracefully when OPENAI_API_KEY is not set (the app
continues with keyword-only matching).
"""

import json
import os
import threading
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()

VALID_INTENTS = frozenset({
    "start_workout", "start_bicep_curl", "start_lateral_raise",
    "ready", "skip", "stop", "ignore",
})

SYSTEM_PROMPT = """\
You are GymBuddy, a motivational and knowledgeable fitness coach AI. \
You help users during real-time workouts via voice.

You receive the user's spoken input and their current workout context. \
Return JSON with two fields:
- "intent": one of the valid command strings if the user wants to perform \
an action, or null for pure conversation
- "response": a short spoken reply (1-2 sentences MAX – it will be read \
aloud via TTS, so brevity is critical)

Valid intents:
- "start_workout" – user wants to begin their loaded workout routine
- "start_bicep_curl" – user wants to do bicep curls
- "start_lateral_raise" – user wants to do lateral raises
- "ready" – user is ready to begin the announced exercise
- "skip" – user wants to skip / delay the current exercise
- "stop" – user wants to stop or end the current workout
- "ignore" – the user is NOT talking to you (side conversation, \
talking to someone else, background chatter). Return this with \
an empty response.
- null – no action needed, just conversation

Guidelines:
- Only set an intent when the user CLEARLY wants that action.
- Consider context: "start" during the ANNOUNCE state means "ready", \
not "start_workout".
- If the speech sounds like a side conversation, phone call, or is \
clearly not directed at GymBuddy, set intent to "ignore" with an \
empty response. Do NOT respond to things not meant for you.
- For fitness questions (form tips, muscle groups, etc.) set intent to \
null and give a brief, helpful answer.
- If Health docs are provided below, ground your answer in them and \
cite the source name inline. Prefer document facts over general knowledge.
- If the user mentions a weight (e.g. "20 pounds", "15 kilos", "thirty \
five"), include a "weight_lbs" field in your JSON with the numeric value \
in pounds. Convert kilograms to pounds (multiply by 2.2). If no weight \
is mentioned, omit the field or set it to null.
- Keep responses SHORT. Max 2 sentences. They are spoken aloud.
- Be encouraging, knowledgeable, and natural. Vary your phrasing.
- If the user says something unclear or off-topic, respond helpfully \
with null intent.
"""


@dataclass
class WorkoutContext:
    """Snapshot of the current workout state sent to the LLM for context."""
    state: str = "idle"
    exercise: str | None = None
    current_set: int | None = None
    total_sets: int | None = None
    reps: dict[str, int] = field(default_factory=dict)
    target_reps: int | None = None
    rest_remaining: float | None = None
    routine_progress: str | None = None
    available_commands: list[str] = field(default_factory=list)


@dataclass
class LLMResponse:
    """Parsed response from the LLM."""
    intent: str | None
    response: str
    weight_lbs: float | None = None


class LLMBrain:
    """Lightweight OpenAI wrapper for intent classification + conversation.

    Thread-safe: all state is guarded by a lock so callers from different
    background threads don't clobber the conversation history.
    """

    def __init__(self, model: str = "gpt-4o-mini") -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print(
                "Warning: OPENAI_API_KEY not set – LLM brain disabled. "
                "Using keyword matching only."
            )
            self._client = None
            self._rag = None
            return

        from openai import OpenAI
        from rag_store import HealthRagStore

        self._client = OpenAI(api_key=api_key)
        self._model = model
        self._lock = threading.Lock()
        self._history: list[dict] = []
        self._max_history = 10
        self._rag = HealthRagStore()
        print(f"LLM brain ready ({model}).")

    @property
    def available(self) -> bool:
        return self._client is not None

    def process(self, transcript: str, context: WorkoutContext) -> LLMResponse:
        """Send a user transcript + workout context to the LLM and return
        a structured intent + natural-language response."""
        if not self._client:
            return LLMResponse(intent=None, response="")

        ctx_lines = [f"State: {context.state}"]
        if context.exercise:
            ctx_lines.append(f"Exercise: {context.exercise}")
        if context.current_set is not None:
            ctx_lines.append(f"Set: {context.current_set}/{context.total_sets}")
        if context.reps:
            reps_str = ", ".join(f"{k}={v}" for k, v in context.reps.items())
            ctx_lines.append(f"Reps: {reps_str} (target: {context.target_reps})")
        if context.rest_remaining is not None:
            ctx_lines.append(f"Rest remaining: {int(context.rest_remaining)}s")
        if context.routine_progress:
            ctx_lines.append(f"Progress: {context.routine_progress}")
        ctx_lines.append(
            f"Valid commands: {', '.join(context.available_commands) or 'none'}"
        )

        rag_block = ""
        if self._rag and self._rag.is_available:
            from rag_store import build_rag_context
            payloads = self._rag.search(transcript)
            if payloads:
                rag_block = f"\n[Health Docs]\n{build_rag_context(payloads)}\n"

        user_msg = (
            f"[Workout Context]\n{chr(10).join(ctx_lines)}\n"
            f"{rag_block}\n"
            f"[User]\n{transcript}"
        )

        with self._lock:
            self._history.append({"role": "user", "content": user_msg})
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]

            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            messages.extend(self._history)

            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.7,
                    max_tokens=150,
                )
                raw = response.choices[0].message.content.strip()
                parsed = json.loads(raw)

                intent = parsed.get("intent")
                if intent not in VALID_INTENTS:
                    intent = None

                resp_text = parsed.get("response", "")
                weight = parsed.get("weight_lbs")
                if weight is not None:
                    try:
                        weight = float(weight)
                    except (ValueError, TypeError):
                        weight = None

                self._history.append({"role": "assistant", "content": raw})
                if len(self._history) > self._max_history:
                    self._history = self._history[-self._max_history:]

                return LLMResponse(
                    intent=intent, response=resp_text, weight_lbs=weight,
                )

            except Exception as exc:
                print(f"[llm] Error: {exc}")
                return LLMResponse(intent=None, response="")
