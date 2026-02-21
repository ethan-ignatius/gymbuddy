"""
Bicep curl exercise tracker and UI panel.
"""

import cv2
import numpy as np

from exercises import (
    BaseTracker, SEV_GOOD, SEV_INFO, SEV_WARN, SEV_BAD,
    SEV_PRIORITY, SEV_COLORS, COLOR_GOOD, COLOR_WARN, COLOR_TEXT,
    COLOR_HUD, score_color, draw_progress_bar,
)

VISIBILITY_THRESHOLD = 0.5


class CurlTracker(BaseTracker):
    """Tracks bicep-curl reps and form for one arm.

    Form checks
    -----------
    1. Elbow pinning       – upper arm should stay at the side of the torso.
    2. Body lean           – torso should stay upright, no swaying to cheat.
    3. ROM (top)           – full contraction at the peak of the curl.
    4. ROM (bottom)        – full extension at the bottom of the curl.
    5. Wrist alignment     – wrist should stay neutral, not curled or bent.
    6. Shoulder shrug      – traps should stay relaxed, shoulder not hiking up.
    7. Elbow flare         – elbow should not drift out laterally from the hip.
    8. Tempo (concentric)  – lifting phase should be controlled (~1-2 s).
    9. Tempo (eccentric)   – lowering phase should be slow and controlled (~2-3 s).
    10. Supination         – palm should be rotated up (supinated grip).
    """

    PHASE_DOWN = "down"
    PHASE_UP = "up"

    CURL_TOP = 60
    CURL_BOTTOM = 140

    # Scoring weights (should sum to ~100)
    W_ELBOW_PIN = 20
    W_LEAN = 15
    W_ROM_TOP = 10
    W_ROM_BOTTOM = 10
    W_WRIST = 10
    W_SHRUG = 10
    W_FLARE = 10
    W_TEMPO_CON = 7
    W_TEMPO_ECC = 8
    W_SUPINATION = 10

    # Thresholds
    SWING_OK = 15
    SWING_WARN = 30
    SWING_BAD = 45

    LEAN_OK = 10
    LEAN_WARN = 18
    LEAN_BAD = 28

    ROM_TOP_GOOD = 50
    ROM_TOP_OK = 70
    ROM_BOTTOM_GOOD = 155
    ROM_BOTTOM_OK = 130

    WRIST_DEV_OK = 15
    WRIST_DEV_WARN = 30

    SHRUG_RATIO_WARN = 0.65

    FLARE_OK = 0.05
    FLARE_WARN = 0.09

    SUP_GOOD = 0.35
    SUP_NEUTRAL = 0.05

    CON_MIN = 0.6
    CON_MAX = 3.0
    ECC_MIN = 1.0
    ECC_MAX = 4.5

    def __init__(self, side: str):
        super().__init__(side)
        self.phase = self.PHASE_DOWN

        self._min_elbow = 180.0
        self._max_elbow = 0.0
        self._peak_swing = 0.0
        self._peak_lean = 0.0
        self._peak_wrist_dev = 0.0
        self._peak_flare = 0.0
        self._shrug_detected = False
        self._min_supination: float = 1.0
        self._phase_start: float = 0.0
        self._con_time: float = 0.0

        self._ref_sh_ear: float = 0.0
        self._sh_ear_samples: list[float] = []

    def update(
        self,
        elbow_angle: float,
        shoulder_angle: float,
        body_lean: float | None,
        wrist_angle: float | None,
        shoulder_ear_dist: float | None,
        elbow_flare_dist: float | None,
        supination: float | None,
        now: float,
    ) -> None:
        self.cur_elbow = elbow_angle
        self._min_elbow = min(self._min_elbow, elbow_angle)
        self._max_elbow = max(self._max_elbow, elbow_angle)
        self._peak_swing = max(self._peak_swing, shoulder_angle)

        if body_lean is not None:
            self._peak_lean = max(self._peak_lean, body_lean)

        if wrist_angle is not None:
            self._peak_wrist_dev = max(self._peak_wrist_dev, abs(180.0 - wrist_angle))

        if elbow_flare_dist is not None:
            self._peak_flare = max(self._peak_flare, elbow_flare_dist)

        if supination is not None:
            self._min_supination = min(self._min_supination, supination)

        self._update_shrug_ref(shoulder_ear_dist)

        # Live mid-rep alerts
        if shoulder_angle > self.SWING_BAD:
            self._trigger("Pin elbow to side!", SEV_BAD, now)
        elif shoulder_angle > self.SWING_WARN:
            self._trigger("Elbow drifting", SEV_WARN, now)

        if body_lean is not None:
            if body_lean > self.LEAN_BAD:
                self._trigger("Stop leaning back!", SEV_BAD, now)
            elif body_lean > self.LEAN_WARN:
                self._trigger("Brace your core", SEV_WARN, now)

        if self._shrug_detected:
            self._trigger("Relax traps!", SEV_WARN, now)

        if elbow_flare_dist is not None and elbow_flare_dist > self.FLARE_WARN:
            self._trigger("Tuck elbow in!", SEV_WARN, now)

        if supination is not None and supination < self.SUP_NEUTRAL:
            self._trigger("Supinate - rotate palm up!", SEV_WARN, now)

        # Phase transitions
        if self.phase == self.PHASE_DOWN and elbow_angle < self.CURL_TOP:
            self.phase = self.PHASE_UP
            self._con_time = now - self._phase_start if self._phase_start else 0.0
            self._phase_start = now
        elif self.phase == self.PHASE_UP and elbow_angle > self.CURL_BOTTOM:
            ecc_time = now - self._phase_start if self._phase_start else 0.0
            self._finish_rep(now, ecc_time)

    @property
    def progress(self) -> float:
        raw = 1.0 - (self.cur_elbow - self.CURL_TOP) / max(
            self.CURL_BOTTOM - self.CURL_TOP, 1
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

    def _finish_rep(self, now: float, ecc_time: float) -> None:
        self.phase = self.PHASE_DOWN
        self.reps += 1
        self._phase_start = now

        score = 100
        issues: list[tuple[str, str]] = []

        if self._peak_swing > self.SWING_BAD:
            issues.append(("Elbow swinging a lot - pin it to your side", SEV_BAD))
            score -= self.W_ELBOW_PIN
        elif self._peak_swing > self.SWING_WARN:
            issues.append(("Elbow drifting forward - keep it pinned", SEV_WARN))
            score -= self.W_ELBOW_PIN // 2
        elif self._peak_swing > self.SWING_OK:
            issues.append(("Slight elbow drift - try to keep it tighter", SEV_INFO))
            score -= self.W_ELBOW_PIN // 4

        if self._peak_lean > self.LEAN_BAD:
            issues.append(("Too much body lean - you're using momentum", SEV_BAD))
            score -= self.W_LEAN
        elif self._peak_lean > self.LEAN_WARN:
            issues.append(("Leaning back a bit - brace your core", SEV_WARN))
            score -= self.W_LEAN // 2
        elif self._peak_lean > self.LEAN_OK:
            issues.append(("Minor torso sway detected", SEV_INFO))
            score -= self.W_LEAN // 4

        if self._min_elbow > self.ROM_TOP_OK:
            issues.append(("Curl higher - squeeze at the top", SEV_WARN))
            score -= self.W_ROM_TOP
        elif self._min_elbow > self.ROM_TOP_GOOD:
            issues.append(("Almost full contraction - try to squeeze more", SEV_INFO))
            score -= self.W_ROM_TOP // 2

        if self._max_elbow < self.ROM_BOTTOM_OK:
            issues.append(("Extend your arm more at the bottom", SEV_WARN))
            score -= self.W_ROM_BOTTOM
        elif self._max_elbow < self.ROM_BOTTOM_GOOD:
            issues.append(("Slightly short extension - straighten a bit more", SEV_INFO))
            score -= self.W_ROM_BOTTOM // 2

        if self._shrug_detected:
            issues.append(("Shoulder hiking up - relax your traps", SEV_WARN))
            score -= self.W_SHRUG

        if self._peak_flare > self.FLARE_WARN:
            issues.append(("Elbow flaring out - keep it tucked in", SEV_WARN))
            score -= self.W_FLARE
        elif self._peak_flare > self.FLARE_OK:
            issues.append(("Slight elbow flare - tuck it closer", SEV_INFO))
            score -= self.W_FLARE // 2

        if self._min_supination < self.SUP_NEUTRAL:
            issues.append(("Rotate palm up - supinate your grip", SEV_WARN))
            score -= self.W_SUPINATION
        elif self._min_supination < self.SUP_GOOD:
            issues.append(("Grip slightly neutral - supinate more", SEV_INFO))
            score -= self.W_SUPINATION // 2

        if self._con_time > 0:
            if self._con_time < self.CON_MIN:
                issues.append(("Lifting too fast - slow down", SEV_WARN))
                score -= self.W_TEMPO_CON
            elif self._con_time > self.CON_MAX:
                issues.append(("Lifting too slow - may lose tension", SEV_WARN))
                score -= self.W_TEMPO_CON // 2

        if ecc_time > 0:
            if ecc_time < self.ECC_MIN:
                issues.append(("Lowering too fast - control the negative", SEV_WARN))
                score -= self.W_TEMPO_ECC
            elif ecc_time > self.ECC_MAX:
                issues.append(("Lowering too slow", SEV_WARN))
                score -= self.W_TEMPO_ECC // 3

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

        self._peak_swing = 0.0
        self._peak_lean = 0.0
        self._min_elbow = 180.0
        self._max_elbow = 0.0
        self._peak_wrist_dev = 0.0
        self._peak_flare = 0.0
        self._shrug_detected = False
        self._min_supination = 1.0
        self._con_time = 0.0


# ---------------------------------------------------------------------------
# Per-frame update (called from main loop)
# ---------------------------------------------------------------------------

def update_trackers(
    trackers: dict[str, CurlTracker],
    landmarks,
    angles: dict,
    hand_supination: dict[str, float | None],
    lean: float | None,
    now: float,
) -> None:
    """Feed one frame of pose data into both L/R curl trackers."""
    side_lm = {
        "L": (11, 13, 15, 23, 7, 19),
        "R": (12, 14, 16, 24, 8, 20),
    }
    for side, (sh, el, wr, hp, ear, idx_f) in side_lm.items():
        elbow_a = angles.get(f"{side} elbow")
        shoulder_a = angles.get(f"{side} shoulder")
        wrist_a = angles.get(f"{side} wrist")
        if elbow_a is None or shoulder_a is None:
            continue

        sh_ear = None
        if (landmarks[sh].visibility or 0) > VISIBILITY_THRESHOLD and \
           (landmarks[ear].visibility or 0) > VISIBILITY_THRESHOLD:
            sh_ear = abs(landmarks[sh].y - landmarks[ear].y)

        flare = None
        if (landmarks[el].visibility or 0) > VISIBILITY_THRESHOLD and \
           (landmarks[hp].visibility or 0) > VISIBILITY_THRESHOLD:
            flare = abs(landmarks[el].x - landmarks[hp].x)

        sup = hand_supination.get(side)
        trackers[side].update(
            elbow_a, shoulder_a, lean,
            wrist_a, sh_ear, flare, sup, now,
        )


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------

def draw_panel(
    frame: np.ndarray,
    trackers: dict[str, CurlTracker],
    angles: dict,
    now: float,
) -> None:
    """Draw the bicep-curl feedback panel on the left side of the frame."""
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

    text("BICEP CURL COACH", COLOR_TEXT, 0.7, True)
    spacer()

    for side in ("L", "R"):
        t = trackers[side]
        elbow_key = f"{side} elbow"

        if t.reps > 0:
            sc = t.last_score
            text(
                f"{side} ARM   Reps: {t.reps}   Score: {sc}",
                score_color(sc), 0.55, True,
            )
        else:
            text(f"{side} ARM   Reps: 0", COLOR_TEXT, 0.55, True)

        bar(t.progress, COLOR_GOOD if t.progress > 0.7 else COLOR_WARN)

        elbow_val = angles.get(elbow_key)
        if elbow_val is not None:
            text(f"  Elbow: {elbow_val:.0f} deg   Phase: {t.phase}")

        if t.reps >= 2:
            text(f"  Avg score: {t.avg_score:.0f}   Best: {max(t.rep_scores)}", (180, 180, 180))

        fb = t.get_feedback(now)
        if fb:
            for msg, sev in fb:
                prefix = "  " if sev == SEV_GOOD else "  ! "
                text(f"{prefix}{msg}", SEV_COLORS.get(sev, COLOR_TEXT))
        elif t.reps == 0:
            text("  Waiting for curl...", (120, 120, 120))

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
