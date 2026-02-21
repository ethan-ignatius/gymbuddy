"""
Lateral raise exercise tracker and UI panel.
"""

import cv2
import numpy as np

from exercises import (
    BaseTracker, SEV_GOOD, SEV_INFO, SEV_WARN, SEV_BAD,
    SEV_PRIORITY, SEV_COLORS, COLOR_GOOD, COLOR_WARN, COLOR_TEXT,
    COLOR_HUD, score_color, draw_progress_bar,
)

VISIBILITY_THRESHOLD = 0.5


class LateralRaiseTracker(BaseTracker):
    """Tracks lateral-raise reps and form for one arm.

    Form checks
    -----------
    1. Peak height      – arms should reach shoulder level (~80-100° abduction).
    2. Elbow bend       – slight bend is ideal (~15-30°); too bent or too straight hurts.
    3. Shoulder shrug   – traps should stay relaxed.
    4. Body lean        – torso should stay upright, no momentum swaying.
    5. Over-raise       – going above shoulder level shifts load to traps.
    6. Tempo (up)       – controlled lift (~1-2 s).
    7. Tempo (down)     – controlled lower (~2-3 s).
    """

    PHASE_DOWN = "down"
    PHASE_UP = "up"

    # Shoulder abduction angle thresholds (elbow-shoulder-hip angle)
    RAISE_TOP = 70       # above this = arm is "up"
    RAISE_BOTTOM = 30    # below this = arm is "down"

    # Scoring weights
    W_HEIGHT = 25
    W_ELBOW_BEND = 15
    W_SHRUG = 15
    W_LEAN = 15
    W_OVER_RAISE = 10
    W_TEMPO_UP = 10
    W_TEMPO_DOWN = 10

    # Height thresholds (shoulder angle at peak)
    HEIGHT_GOOD = 75     # good peak abduction
    HEIGHT_OK = 55       # acceptable
    OVER_RAISE = 110     # above this = too high, traps take over

    # Elbow bend (ideal is ~160-170° = slight bend)
    ELBOW_TOO_BENT = 120     # below this = too much bend
    ELBOW_SLIGHTLY_BENT = 145
    ELBOW_TOO_STRAIGHT = 175  # above this = locked out, joint stress

    # Body lean
    LEAN_OK = 8
    LEAN_WARN = 15
    LEAN_BAD = 25

    # Shoulder shrug
    SHRUG_RATIO_WARN = 0.65

    # Tempo (seconds)
    UP_MIN = 0.6
    UP_MAX = 3.0
    DOWN_MIN = 0.8
    DOWN_MAX = 4.0

    def __init__(self, side: str):
        super().__init__(side)
        self.phase = self.PHASE_DOWN

        self._peak_shoulder_angle = 0.0
        self._min_elbow_angle = 180.0
        self._peak_lean = 0.0
        self._shrug_detected = False
        self._phase_start: float = 0.0
        self._up_time: float = 0.0

        self._ref_sh_ear: float = 0.0
        self._sh_ear_samples: list[float] = []

        self.cur_shoulder_angle: float = 0.0

    def update(
        self,
        shoulder_angle: float,
        elbow_angle: float,
        body_lean: float | None,
        shoulder_ear_dist: float | None,
        now: float,
    ) -> None:
        self.cur_shoulder_angle = shoulder_angle
        self._peak_shoulder_angle = max(self._peak_shoulder_angle, shoulder_angle)
        self._min_elbow_angle = min(self._min_elbow_angle, elbow_angle)

        if body_lean is not None:
            self._peak_lean = max(self._peak_lean, body_lean)

        self._update_shrug_ref(shoulder_ear_dist)

        # Live mid-rep alerts
        if shoulder_angle > self.OVER_RAISE:
            self._trigger("Too high! Stop at shoulder level", SEV_BAD, now)

        if body_lean is not None:
            if body_lean > self.LEAN_BAD:
                self._trigger("Stop swaying!", SEV_BAD, now)
            elif body_lean > self.LEAN_WARN:
                self._trigger("Brace your core", SEV_WARN, now)

        if self._shrug_detected:
            self._trigger("Relax traps - don't shrug!", SEV_WARN, now)

        if elbow_angle < self.ELBOW_TOO_BENT:
            self._trigger("Straighten arms more!", SEV_WARN, now)
        elif elbow_angle > self.ELBOW_TOO_STRAIGHT:
            self._trigger("Bend elbows slightly!", SEV_WARN, now)

        # Phase transitions
        if self.phase == self.PHASE_DOWN and shoulder_angle > self.RAISE_TOP:
            self.phase = self.PHASE_UP
            self._up_time = now - self._phase_start if self._phase_start else 0.0
            self._phase_start = now
        elif self.phase == self.PHASE_UP and shoulder_angle < self.RAISE_BOTTOM:
            down_time = now - self._phase_start if self._phase_start else 0.0
            self._finish_rep(now, down_time)

    @property
    def progress(self) -> float:
        raw = (self.cur_shoulder_angle - self.RAISE_BOTTOM) / max(
            self.RAISE_TOP - self.RAISE_BOTTOM, 1
        )
        return float(np.clip(raw, 0.0, 1.0))

    def _update_shrug_ref(self, sh_ear: float | None) -> None:
        if sh_ear is None or sh_ear < 0.01:
            return
        if len(self._sh_ear_samples) < 30:
            self._sh_ear_samples.append(sh_ear)
            self._ref_sh_ear = max(self._sh_ear_samples)
        elif self._ref_sh_ear > 0 and sh_ear < self._ref_sh_ear * self.SHRUG_RATIO_WARN:
            self._shrug_detected = True

    def _finish_rep(self, now: float, down_time: float) -> None:
        self.phase = self.PHASE_DOWN
        self.reps += 1
        self._phase_start = now

        score = 100
        issues: list[tuple[str, str]] = []

        # 1. Peak height
        if self._peak_shoulder_angle < self.HEIGHT_OK:
            issues.append(("Raise arms higher - reach shoulder level", SEV_BAD))
            score -= self.W_HEIGHT
        elif self._peak_shoulder_angle < self.HEIGHT_GOOD:
            issues.append(("Almost there - raise a bit higher", SEV_WARN))
            score -= self.W_HEIGHT // 2

        # 2. Over-raise
        if self._peak_shoulder_angle > self.OVER_RAISE:
            issues.append(("Arms too high - stop at shoulder level", SEV_WARN))
            score -= self.W_OVER_RAISE

        # 3. Elbow bend
        if self._min_elbow_angle < self.ELBOW_TOO_BENT:
            issues.append(("Arms too bent - extend elbows more", SEV_WARN))
            score -= self.W_ELBOW_BEND
        elif self._min_elbow_angle < self.ELBOW_SLIGHTLY_BENT:
            issues.append(("Elbows bending a bit much", SEV_INFO))
            score -= self.W_ELBOW_BEND // 3
        elif self._min_elbow_angle > self.ELBOW_TOO_STRAIGHT:
            issues.append(("Don't lock elbows - keep a slight bend", SEV_INFO))
            score -= self.W_ELBOW_BEND // 4

        # 4. Shoulder shrug
        if self._shrug_detected:
            issues.append(("Traps taking over - relax shoulders down", SEV_WARN))
            score -= self.W_SHRUG

        # 5. Body lean
        if self._peak_lean > self.LEAN_BAD:
            issues.append(("Too much body sway - using momentum", SEV_BAD))
            score -= self.W_LEAN
        elif self._peak_lean > self.LEAN_WARN:
            issues.append(("Slight lean - tighten your core", SEV_WARN))
            score -= self.W_LEAN // 2
        elif self._peak_lean > self.LEAN_OK:
            issues.append(("Minor sway detected", SEV_INFO))
            score -= self.W_LEAN // 4

        # 6. Tempo up
        if self._up_time > 0:
            if self._up_time < self.UP_MIN:
                issues.append(("Raising too fast - slow down", SEV_WARN))
                score -= self.W_TEMPO_UP
            elif self._up_time > self.UP_MAX:
                issues.append(("Raising too slow", SEV_INFO))
                score -= self.W_TEMPO_UP // 3

        # 7. Tempo down
        if down_time > 0:
            if down_time < self.DOWN_MIN:
                issues.append(("Lowering too fast - control it", SEV_WARN))
                score -= self.W_TEMPO_DOWN
            elif down_time > self.DOWN_MAX:
                issues.append(("Lowering too slow", SEV_INFO))
                score -= self.W_TEMPO_DOWN // 3

        score = max(score, 0)
        self.last_score = score
        self.rep_scores.append(score)

        issues.sort(key=lambda x: SEV_PRIORITY.get(x[1], 99))

        if not issues:
            self.active_feedback = [("Perfect rep!", SEV_GOOD)]
        else:
            self.active_feedback = issues
        self._feedback_expiry = now + 5.0

        self._speech_queue = self._build_speech_queue(issues)

        # Reset accumulators
        self._peak_shoulder_angle = 0.0
        self._min_elbow_angle = 180.0
        self._peak_lean = 0.0
        self._shrug_detected = False
        self._up_time = 0.0


# ---------------------------------------------------------------------------
# Per-frame update (called from main loop)
# ---------------------------------------------------------------------------

def update_trackers(
    trackers: dict[str, LateralRaiseTracker],
    landmarks,
    angles: dict,
    lean: float | None,
    now: float,
) -> None:
    """Feed one frame of pose data into both L/R lateral raise trackers."""
    side_indices = {
        "L": (11, 7),   # (shoulder, ear)
        "R": (12, 8),
    }
    for side, (sh, ear) in side_indices.items():
        shoulder_a = angles.get(f"{side} shoulder")
        elbow_a = angles.get(f"{side} elbow")
        if shoulder_a is None or elbow_a is None:
            continue

        sh_ear = None
        if (landmarks[sh].visibility or 0) > VISIBILITY_THRESHOLD and \
           (landmarks[ear].visibility or 0) > VISIBILITY_THRESHOLD:
            sh_ear = abs(landmarks[sh].y - landmarks[ear].y)

        trackers[side].update(shoulder_a, elbow_a, lean, sh_ear, now)


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------

def draw_panel(
    frame: np.ndarray,
    trackers: dict[str, LateralRaiseTracker],
    angles: dict,
    now: float,
) -> None:
    """Draw the lateral-raise feedback panel on the left side of the frame."""
    overlay = frame.copy()

    pad = 14
    line_h = 28
    bar_h = 14
    col_x = pad
    box_w = 380

    entries: list[tuple] = []

    def text(msg, color=COLOR_TEXT, scale=0.55, bold=False):
        entries.append(("text", msg, color, scale, bold))

    def bar(progress, color):
        entries.append(("bar", "", color, progress, False))

    def spacer():
        entries.append(("spacer", "", COLOR_TEXT, 0, False))

    text("LATERAL RAISE COACH", COLOR_TEXT, 0.7, True)
    spacer()

    for side in ("L", "R"):
        t = trackers[side]
        shoulder_key = f"{side} shoulder"

        if t.reps > 0:
            sc = t.last_score
            text(
                f"{side} ARM   Reps: {t.reps}   Score: {sc}",
                score_color(sc), 0.55, True,
            )
        else:
            text(f"{side} ARM   Reps: 0", COLOR_TEXT, 0.55, True)

        bar(t.progress, COLOR_GOOD if t.progress > 0.7 else COLOR_WARN)

        shoulder_val = angles.get(shoulder_key)
        elbow_val = angles.get(f"{side} elbow")
        if shoulder_val is not None:
            phase_label = t.phase
            text(f"  Shoulder: {shoulder_val:.0f} deg   Phase: {phase_label}")
        if elbow_val is not None:
            text(f"  Elbow: {elbow_val:.0f} deg")

        if t.reps >= 2:
            text(f"  Avg score: {t.avg_score:.0f}   Best: {max(t.rep_scores)}", (180, 180, 180))

        fb = t.get_feedback(now)
        if fb:
            for msg, sev in fb:
                prefix = "  " if sev == SEV_GOOD else "  ! "
                text(f"{prefix}{msg}", SEV_COLORS.get(sev, COLOR_TEXT))
        elif t.reps == 0:
            text("  Waiting for raise...", (120, 120, 120))

        spacer()

    total_h = pad * 2
    for kind, *_ in entries:
        if kind == "bar":
            total_h += bar_h + 6
        elif kind == "spacer":
            total_h += 8
        else:
            total_h += line_h

    cv2.rectangle(overlay, (0, 0), (box_w, total_h), COLOR_HUD, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    y = pad
    for kind, msg, color, extra, bold in entries:
        if kind == "text":
            y += line_h
            cv2.putText(
                frame, msg, (col_x, y),
                cv2.FONT_HERSHEY_SIMPLEX, extra, color,
                2 if bold else 1, cv2.LINE_AA,
            )
        elif kind == "bar":
            y += 4
            draw_progress_bar(frame, col_x, y, box_w - pad * 2, bar_h, extra, color)
            y += bar_h + 2
        elif kind == "spacer":
            y += 8
