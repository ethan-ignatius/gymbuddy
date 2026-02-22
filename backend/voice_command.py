"""
Voice command listener – background mic capture + local Whisper transcription
with optional OpenAI LLM fallback for natural language understanding.

Clear commands (start, stop, skip, etc.) are handled instantly via keyword
matching.  Anything the keywords can't resolve is forwarded to the LLM
for intent classification *and* a conversational response.
"""

import io
import queue
import re
import threading
import time
import wave
from dataclasses import dataclass

import numpy as np
import speech_recognition as sr
import whisper

_KEYWORD_RULES: list[tuple[str, re.Pattern]] = [
    ("start_workout", re.compile(
        r"(start\s*work\s*out|begin\s*work\s*out|let.s\s*work\s*out|"
        r"start\s*routine|begin\s*routine|let.s\s*go)",
        re.IGNORECASE,
    )),
    ("start_bicep_curl", re.compile(
        r"(bicep|curls?|bicep\s*curls?|start.*curl|do.*curl|begin.*curl|let.s.*curl)",
        re.IGNORECASE,
    )),
    ("start_lateral_raise", re.compile(
        r"(lateral\s*raise|side\s*raise|shoulder\s*raise|"
        r"start.*raise|do.*raise|begin.*raise|let.s.*raise)",
        re.IGNORECASE,
    )),
    ("skip", re.compile(
        r"(skip|later|next|pass|delay|not\s*now|move\s*on)",
        re.IGNORECASE,
    )),
    ("ready", re.compile(
        r"^(start|ready|go|begin|i.m\s*ready|let.s\s*do\s*it)$",
        re.IGNORECASE,
    )),
    ("stop", re.compile(
        r"^(stop|done|finish|end|quit|that.s\s*(it|enough)|i.m\s*done)",
        re.IGNORECASE,
    )),
]

INTENTS = {
    "start_workout", "start_bicep_curl", "start_lateral_raise",
    "ready", "skip", "stop", "unknown",
}


@dataclass
class VoiceResult:
    """Result from voice processing: classified intent + optional LLM response."""
    intent: str | None
    transcript: str
    response: str | None = None
    weight_lbs: float | None = None


def _classify_text(text: str) -> str:
    """Classify transcript into an intent using keyword rules."""
    text = re.sub(r"[^\w\s']", "", text).strip()
    if not text:
        return "unknown"
    for intent, pattern in _KEYWORD_RULES:
        if pattern.search(text):
            return intent
    return "unknown"


def _extract_weight_from_transcript(transcript: str) -> float | None:
    """Extract weight in lbs from phrases like 'start 20 pounds', '20 lbs', '15 kilos'."""
    if not transcript:
        return None
    lowered = transcript.lower().strip()
    # e.g. "20 pounds", "20 lbs", "20 lb", "20.5 lbs"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?|lb)\b", lowered)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    # e.g. "15 kilos", "15 kg"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:kilos?|kgs?|kg)\b", lowered)
    if m:
        try:
            return round(float(m.group(1)) * 2.2, 1)
        except ValueError:
            pass
    # e.g. "start 20" or "ready 15" – number after command word
    m = re.search(r"(?:start|ready|go|begin)\s+(\d+(?:\.\d+)?)", lowered)
    if m:
        try:
            val = float(m.group(1))
            if 1 <= val <= 500:
                return val
        except ValueError:
            pass
    return None


def _wav_bytes_to_float32(wav_bytes: bytes) -> np.ndarray:
    """Convert WAV bytes (16-bit PCM) to float32 numpy array for Whisper."""
    buf = io.BytesIO(wav_bytes)
    with wave.open(buf, "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


class VoiceCommandListener:
    """Non-blocking voice command listener with local Whisper transcription
    and optional OpenAI LLM for natural language understanding.

    Usage::

        listener = VoiceCommandListener()
        listener.start()

        # in your frame loop:
        result = listener.get_command()
        if result and result.intent == "start_bicep_curl": ...
    """

    _MUTE_GRACE = 0.5

    def __init__(
        self,
        whisper_model: str = "tiny.en",
        is_speaking_fn=None,
        llm_brain=None,
        get_context_fn=None,
        use_llm_only: bool = True,
    ) -> None:
        """
        Args:
            whisper_model: Whisper model size.
            is_speaking_fn: Callable returning True while TTS is playing.
                            Audio captured during speech (+ grace period) is
                            discarded so the mic doesn't hear its own output.
            llm_brain: Optional ``LLMBrain`` instance for LLM fallback.
            get_context_fn: Callable returning a ``WorkoutContext`` snapshot.
                            Called from the processing thread at transcription
                            time so the LLM gets up-to-date workout state.
            use_llm_only: When True, ALL transcripts are sent through the LLM
                          (natural responses for everything).  When False,
                          clear keyword matches use the fast regex path and
                          only unrecognised input falls through to the LLM.
        """
        print(f"Loading Whisper model '{whisper_model}'...")
        self._whisper = whisper.load_model(whisper_model)
        print("Whisper model loaded.")

        self._is_speaking_fn = is_speaking_fn
        self._mute_until: float = 0.0

        self._llm = llm_brain
        self._get_context_fn = get_context_fn
        self.use_llm_only = use_llm_only

        self._recognizer = sr.Recognizer()
        self._mic = sr.Microphone()
        self._command_queue: queue.Queue[VoiceResult] = queue.Queue()
        self._stop_listening = None
        self._is_listening = False
        self._processing = False
        self._last_transcript = ""

    @property
    def is_listening(self) -> bool:
        return self._is_listening

    @property
    def is_processing(self) -> bool:
        return self._processing

    @property
    def last_transcript(self) -> str:
        return self._last_transcript

    def start(self) -> None:
        """Begin background listening."""
        with self._mic as source:
            self._recognizer.adjust_for_ambient_noise(source, duration=0.5)
        self._stop_listening = self._recognizer.listen_in_background(
            self._mic, self._audio_callback, phrase_time_limit=3,
        )
        self._is_listening = True
        print("Voice commands active. Speak to control your workout.")

    def stop(self) -> None:
        if self._stop_listening:
            self._stop_listening(wait_for_stop=False)
            self._is_listening = False

    def get_command(self) -> VoiceResult | None:
        """Non-blocking: return the next voice result, or None."""
        try:
            return self._command_queue.get_nowait()
        except queue.Empty:
            return None

    def _is_muted(self) -> bool:
        """True when we should ignore mic input (TTS playing or just finished)."""
        if self._is_speaking_fn and self._is_speaking_fn():
            self._mute_until = time.time() + self._MUTE_GRACE
            return True
        return time.time() < self._mute_until

    def _audio_callback(self, recognizer: sr.Recognizer, audio: sr.AudioData) -> None:
        """Called by the background listener when speech is detected."""
        if self._is_muted():
            return
        threading.Thread(
            target=self._process_audio, args=(audio,), daemon=True,
        ).start()

    def _process_audio(self, audio: sr.AudioData) -> None:
        if self._is_muted():
            return
        self._processing = True
        try:
            wav_data = audio.get_wav_data(convert_rate=16000, convert_width=2)
            audio_np = _wav_bytes_to_float32(wav_data)

            result = self._whisper.transcribe(
                audio_np, language="en", fp16=False,
            )
            transcript = result["text"].strip()

            if not transcript or transcript.lower() in (
                "you", ".", "thank you.", "thanks for watching.",
                "thanks for watching!", "",
            ):
                self._processing = False
                return

            self._last_transcript = transcript
            print(f"[voice] Heard: {transcript!r}")

            # ---- Keyword-first mode: try regex, fall back to LLM ----
            if not self.use_llm_only:
                intent = _classify_text(transcript)
                if intent != "unknown":
                    weight = _extract_weight_from_transcript(transcript)
                    print(f"[voice] Intent (keyword): {intent}" + (f", weight={weight} lbs" if weight else ""))
                    self._command_queue.put(VoiceResult(
                        intent=intent, transcript=transcript, weight_lbs=weight,
                    ))
                    return

            # ---- LLM path (always reached in LLM-only mode) ----
            if self._llm and self._llm.available:
                from llm_brain import WorkoutContext

                ctx = (self._get_context_fn()
                       if self._get_context_fn else WorkoutContext())
                llm_resp = self._llm.process(transcript, ctx)
                if llm_resp.intent == "ignore":
                    print("[voice] Ignored (not directed at GymBuddy)")
                    return
                weight = llm_resp.weight_lbs or _extract_weight_from_transcript(transcript)
                vr = VoiceResult(
                    intent=llm_resp.intent,
                    transcript=transcript,
                    response=llm_resp.response or None,
                    weight_lbs=weight,
                )
                if vr.intent or vr.response:
                    self._command_queue.put(vr)
                    print(
                        f"[voice] LLM -> intent={vr.intent}, "
                        f"response={vr.response!r}"
                    )
                else:
                    print("[voice] LLM returned nothing actionable")

            # ---- No LLM available: last-resort keyword match ----
            elif not self.use_llm_only:
                print("[voice] Intent: unknown (no LLM fallback)")
            else:
                intent = _classify_text(transcript)
                if intent != "unknown":
                    weight = _extract_weight_from_transcript(transcript)
                    print(f"[voice] Intent (keyword fallback): {intent}" + (f", weight={weight} lbs" if weight else ""))
                    self._command_queue.put(VoiceResult(
                        intent=intent, transcript=transcript, weight_lbs=weight,
                    ))
                else:
                    print("[voice] Intent: unknown (LLM unavailable)")
        except Exception as exc:
            print(f"[voice] Error: {exc}")
        finally:
            self._processing = False


if __name__ == "__main__":
    listener = VoiceCommandListener()
    listener.start()
    print("Listening... speak a command (Ctrl+C to quit)")
    try:
        while True:
            result = listener.get_command()
            if result:
                print(
                    f"  -> Intent: {result.intent}, "
                    f"Response: {result.response!r}"
                )
            time.sleep(0.1)
    except KeyboardInterrupt:
        listener.stop()
