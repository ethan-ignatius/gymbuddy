"""
Voice command listener – background mic capture + local Whisper transcription.

Listens continuously for voice commands via the microphone, transcribes
locally with Whisper (no API needed), and classifies intent via keyword
matching.
"""

import io
import queue
import re
import threading
import time
import wave

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
    "ready", "skip", "stop", "question", "unknown",
}


def _classify_text(text: str) -> str:
    """Classify transcript into an intent using keyword rules."""
    normalized = re.sub(r"[^\w\s'?!]", "", text).strip()
    if not normalized:
        return "unknown"

    # Workout commands always win over generic question detection.
    for intent, pattern in _KEYWORD_RULES:
        if pattern.search(normalized):
            return intent

    if _is_question(normalized):
        return "question"
    return "unknown"


def _is_question(text: str) -> bool:
    if "?" in text:
        return True
    lowered = text.lower().strip()
    question_starters = (
        "what", "why", "how", "when", "where", "who", "which",
        "can", "could", "should", "would", "do", "does", "did",
        "is", "are", "am", "will", "tell me", "explain",
    )
    return lowered.startswith(question_starters)


def _wav_bytes_to_float32(wav_bytes: bytes) -> np.ndarray:
    """Convert WAV bytes (16-bit PCM) to float32 numpy array for Whisper."""
    buf = io.BytesIO(wav_bytes)
    with wave.open(buf, "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


class VoiceCommandListener:
    """Non-blocking voice command listener with local Whisper transcription.

    Usage::

        listener = VoiceCommandListener()
        listener.start()

        # in your frame loop:
        cmd = listener.get_command()
        if cmd == "start_bicep_curl": ...
    """

    _MUTE_GRACE = 1.0  # seconds to stay muted after TTS finishes

    def __init__(
        self,
        whisper_model: str = "tiny.en",
        is_speaking_fn=None,
    ) -> None:
        """
        Args:
            whisper_model: Whisper model size.
            is_speaking_fn: Callable returning True while TTS is playing.
                            Audio captured during speech (+ grace period) is
                            discarded so the mic doesn't hear its own output.
        """
        print(f"Loading Whisper model '{whisper_model}'...")
        self._whisper = whisper.load_model(whisper_model)
        print("Whisper model loaded.")

        self._is_speaking_fn = is_speaking_fn
        self._mute_until: float = 0.0

        self._recognizer = sr.Recognizer()
        self._mic = sr.Microphone()
        self._command_queue: queue.Queue[str] = queue.Queue()
        self._message_queue: queue.Queue[str] = queue.Queue()
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
            self._recognizer.adjust_for_ambient_noise(source, duration=1)
        self._stop_listening = self._recognizer.listen_in_background(
            self._mic, self._audio_callback, phrase_time_limit=5,
        )
        self._is_listening = True
        print("Voice commands active. Speak to control your workout.")

    def stop(self) -> None:
        if self._stop_listening:
            self._stop_listening(wait_for_stop=False)
            self._is_listening = False

    def get_command(self) -> str | None:
        """Non-blocking: return the next classified intent, or None."""
        try:
            return self._command_queue.get_nowait()
        except queue.Empty:
            return None

    def get_message(self) -> str | None:
        """Non-blocking: return the next non-command transcript, or None."""
        try:
            return self._message_queue.get_nowait()
        except queue.Empty:
            return None

    def _is_muted(self) -> bool:
        """True when we should ignore mic input (TTS is playing or just finished)."""
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

            intent = _classify_text(transcript)
            print(f"[voice] Intent: {intent}")
            if intent in INTENTS and intent not in ("unknown", "question"):
                self._command_queue.put(intent)
            else:
                self._message_queue.put(transcript)
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
            cmd = listener.get_command()
            if cmd:
                print(f"  -> Command: {cmd}")
            time.sleep(0.1)
    except KeyboardInterrupt:
        listener.stop()
