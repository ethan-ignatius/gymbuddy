"""
Exercise analysis modules for GymBuddy.

Shared severity constants, color mappings, and common drawing helpers
used across all exercise trackers.
"""

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Severity system (shared by all exercises)
# ---------------------------------------------------------------------------

SEV_GOOD = "good"
SEV_INFO = "info"
SEV_WARN = "warn"
SEV_BAD = "bad"

SEV_PRIORITY = {SEV_BAD: 0, SEV_WARN: 1, SEV_INFO: 2, SEV_GOOD: 3}

COLOR_GOOD = (0, 220, 0)
COLOR_WARN = (0, 180, 255)
COLOR_BAD = (0, 0, 255)
COLOR_TEXT = (255, 255, 255)
COLOR_HUD = (40, 40, 40)

SEV_COLORS = {
    SEV_GOOD: COLOR_GOOD,
    SEV_INFO: COLOR_TEXT,
    SEV_WARN: COLOR_WARN,
    SEV_BAD: COLOR_BAD,
}


# ---------------------------------------------------------------------------
# Shared drawing helpers
# ---------------------------------------------------------------------------


def score_color(score: int) -> tuple[int, int, int]:
    if score >= 85:
        return COLOR_GOOD
    if score >= 60:
        return COLOR_WARN
    return COLOR_BAD


def draw_progress_bar(
    frame: np.ndarray, x: int, y: int, w: int, h: int,
    progress: float, color: tuple[int, int, int],
) -> None:
    cv2.rectangle(frame, (x, y), (x + w, y + h), (80, 80, 80), -1)
    fill_w = int(w * np.clip(progress, 0, 1))
    if fill_w > 0:
        cv2.rectangle(frame, (x, y), (x + fill_w, y + h), color, -1)
    cv2.rectangle(frame, (x, y), (x + w, y + h), (160, 160, 160), 1)


def draw_live_alerts(
    frame: np.ndarray,
    trackers: dict,
    now: float,
) -> None:
    """Render big mid-rep warning banners across the center of the frame."""
    fh, fw = frame.shape[:2]
    alerts: list[tuple[str, str]] = []
    for side in ("L", "R"):
        for msg, sev in trackers[side].get_live_alerts(now):
            tag = f"{side}: {msg}"
            if (tag, sev) not in alerts:
                alerts.append((tag, sev))

    if not alerts:
        return

    banner_h = 52
    total_h = banner_h * len(alerts)
    start_y = fh // 2 - total_h // 2

    overlay = frame.copy()
    for i, (_msg, sev) in enumerate(alerts):
        y = start_y + i * banner_h
        bg = (0, 0, 80) if sev == SEV_BAD else (0, 50, 80)
        cv2.rectangle(overlay, (0, y), (fw, y + banner_h), bg, -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    for i, (msg, sev) in enumerate(alerts):
        y = start_y + i * banner_h
        color = SEV_COLORS.get(sev, COLOR_WARN)
        text_size = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.9, 2)[0]
        tx = (fw - text_size[0]) // 2
        ty = y + (banner_h + text_size[1]) // 2
        cv2.putText(
            frame, msg, (tx, ty),
            cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Base tracker mixin (common live-alert and feedback plumbing)
# ---------------------------------------------------------------------------


INJURY_CRITICAL_SCORE = 25
INJURY_BAD_SCORE = 40
INJURY_CONSECUTIVE_LIMIT = 3


class BaseTracker:
    """Common state and helpers shared by all exercise trackers."""

    LIVE_GRACE = 0.35

    def __init__(self, side: str) -> None:
        self.side = side
        self.reps = 0
        self.cur_elbow: float = 180.0

        self._live_triggers: dict[str, tuple[str, float]] = {}
        self.active_feedback: list[tuple[str, str]] = []
        self._feedback_expiry: float = 0.0
        self.last_score: int = 0
        self.rep_scores: list[int] = []
        self._speech_queue: list[str] = []
        self._consecutive_bad: int = 0
        self.injury_warning: bool = False

    # --- Live alerts ---

    def _trigger(self, msg: str, sev: str, now: float) -> None:
        self._live_triggers[msg] = (sev, now)

    def get_live_alerts(self, now: float) -> list[tuple[str, str]]:
        active = []
        expired = []
        for msg, (sev, last_t) in self._live_triggers.items():
            if now - last_t <= self.LIVE_GRACE:
                active.append((msg, sev))
            else:
                expired.append(msg)
        for k in expired:
            del self._live_triggers[k]
        return active

    def get_feedback(self, now: float) -> list[tuple[str, str]]:
        if now < self._feedback_expiry:
            return self.active_feedback
        return []

    def take_speech(self) -> str | None:
        if self._speech_queue:
            return self._speech_queue.pop(0)
        return None

    @staticmethod
    def _build_speech_queue(issues: list[tuple[str, str]]) -> list[str]:
        voiced = [msg for msg, sev in issues if sev in (SEV_BAD, SEV_WARN)]
        return voiced if voiced else ["Good job!"]

    def _check_injury_risk(self) -> None:
        """Call after setting last_score and _speech_queue.  Tracks consecutive
        bad reps and prepends an urgent voice warning when form is dangerous."""
        score = self.last_score

        if score <= INJURY_BAD_SCORE:
            self._consecutive_bad += 1
        else:
            self._consecutive_bad = max(0, self._consecutive_bad - 1)

        if score <= INJURY_CRITICAL_SCORE:
            self.injury_warning = True
            self._speech_queue.insert(
                0,
                "Warning! That rep had very poor form and could cause injury. "
                "Lower the weight or fix your form before continuing.",
            )
        elif self._consecutive_bad >= INJURY_CONSECUTIVE_LIMIT:
            self.injury_warning = True
            self._speech_queue.insert(
                0,
                "Careful! Multiple reps with bad form. "
                "You risk hurting yourself. Take a break or reduce the weight.",
            )
        else:
            self.injury_warning = False

    @property
    def avg_score(self) -> float:
        return sum(self.rep_scores) / len(self.rep_scores) if self.rep_scores else 0.0

    @property
    def progress(self) -> float:
        return 0.0  # overridden by subclasses
