"""
Voice coach – non-blocking TTS via ElevenLabs.

Runs speech in a background thread so the video loop never blocks.
Only the latest queued message is kept; older pending messages are
discarded so the coach stays current.
"""

import os
import threading
import time

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.play import play

load_dotenv()

# If ELEVENLABS_VOICE_ID is unset/empty, omit voice_id to use provider default.
_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID") or None
# If ELEVENLABS_VOICE_MODEL is unset/empty, omit model_id to use provider default.
_MODEL_ID = os.getenv("ELEVENLABS_VOICE_MODEL") or "eleven_turbo_v2_5"
_OUTPUT_FMT = os.getenv("ELEVENLABS_OUTPUT_FORMAT") or "mp3_22050_32"
_PAUSE_AFTER = float(os.getenv("ELEVENLABS_PAUSE_AFTER") or "0.5")


class VoiceCoach:
    """Speaks form feedback without blocking the caller.

    Usage::

        coach = VoiceCoach()
        coach.say("Pin your elbow to your side")
        # returns immediately; speech happens in background
    """

    def __init__(self) -> None:
        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            print("Warning: ELEVENLABS_API_KEY not set – voice coach disabled.")
        self._client = ElevenLabs(api_key=api_key) if api_key else None

        self._lock = threading.Lock()
        self._pending: str | None = None
        self._busy = False

        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    @property
    def is_busy(self) -> bool:
        return self._busy

    def say(self, text: str) -> None:
        """Queue *text* to be spoken.  Overwrites any un-spoken pending text."""
        if self._client is None:
            return
        with self._lock:
            self._pending = text

    def _worker(self) -> None:
        while True:
            with self._lock:
                text = self._pending
                self._pending = None

            if text is None:
                time.sleep(0.05)
                continue

            self._busy = True
            try:
                kwargs = {"text": text, "output_format": _OUTPUT_FMT}
                if _VOICE_ID:
                    kwargs["voice_id"] = _VOICE_ID
                if _MODEL_ID:
                    kwargs["model_id"] = _MODEL_ID
                audio = self._client.text_to_speech.convert(**kwargs)
                play(audio)
                time.sleep(_PAUSE_AFTER)
            except Exception as exc:
                print(f"VoiceCoach error: {exc}")
            finally:
                self._busy = False


if __name__ == "__main__":
    coach = VoiceCoach()
    coach.say("Welcome to Gym Buddy. Let's get started.")
    time.sleep(8)
