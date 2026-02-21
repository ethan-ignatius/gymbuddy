"""
Real-time pose + hand tracking using MediaPipe Pose & Hand Landmarkers.

Opens the webcam feed, detects 33 body landmarks and 21 hand landmarks
per hand, and renders annotated skeleton / finger overlays with joint
names and confidence indicators.  Press 'q' to quit.
"""

import time
import math
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/latest/"
    "pose_landmarker_lite.task"
)
POSE_MODEL_PATH = "pose_landmarker_lite.task"

HAND_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/latest/"
    "hand_landmarker.task"
)
HAND_MODEL_PATH = "hand_landmarker.task"

LANDMARK_NAMES = [
    "nose", "left eye (inner)", "left eye", "left eye (outer)",
    "right eye (inner)", "right eye", "right eye (outer)",
    "left ear", "right ear",
    "mouth (left)", "mouth (right)",
    "left shoulder", "right shoulder",
    "left elbow", "right elbow",
    "left wrist", "right wrist",
    "left pinky", "right pinky",
    "left index", "right index",
    "left thumb", "right thumb",
    "left hip", "right hip",
    "left knee", "right knee",
    "left ankle", "right ankle",
    "left heel", "right heel",
    "left foot index", "right foot index",
]

# Pairs of landmark indices that form the skeleton edges.
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7),     # left eye -> left ear
    (0, 4), (4, 5), (5, 6), (6, 8),     # right eye -> right ear
    (9, 10),                              # mouth
    (11, 12),                             # shoulders
    (11, 13), (13, 15),                   # left arm
    (12, 14), (14, 16),                   # right arm
    (15, 17), (15, 19), (15, 21),         # left hand
    (16, 18), (16, 20), (16, 22),         # right hand
    (11, 23), (12, 24),                   # torso sides
    (23, 24),                             # hips
    (23, 25), (25, 27),                   # left leg
    (24, 26), (26, 28),                   # right leg
    (27, 29), (29, 31),                   # left foot
    (28, 30), (30, 32),                   # right foot
]

# Hand landmark indices.
HAND_LANDMARK_NAMES = [
    "wrist",
    "thumb cmc", "thumb mcp", "thumb ip", "thumb tip",
    "index mcp", "index pip", "index dip", "index tip",
    "middle mcp", "middle pip", "middle dip", "middle tip",
    "ring mcp", "ring pip", "ring dip", "ring tip",
    "pinky mcp", "pinky pip", "pinky dip", "pinky tip",
]

HAND_CONNECTIONS = [
    # Thumb
    (0, 1), (1, 2), (2, 3), (3, 4),
    # Index
    (0, 5), (5, 6), (6, 7), (7, 8),
    # Middle
    (0, 9), (9, 10), (10, 11), (11, 12),
    # Ring
    (0, 13), (13, 14), (14, 15), (15, 16),
    # Pinky
    (0, 17), (17, 18), (18, 19), (19, 20),
    # Palm
    (5, 9), (9, 13), (13, 17),
]

HAND_FINGERTIP_LABELS = {
    4: "thumb", 8: "index", 12: "middle", 16: "ring", 20: "pinky",
}

# Color palette (BGR)
COLOR_JOINT = (0, 255, 128)
COLOR_BONE = (255, 200, 50)
COLOR_LOW_CONF = (0, 0, 255)
COLOR_TEXT = (255, 255, 255)
COLOR_HUD = (40, 40, 40)
COLOR_HAND_LEFT = (255, 120, 50)    # blue-ish for left hand
COLOR_HAND_RIGHT = (50, 200, 255)   # orange-ish for right hand
COLOR_HAND_BONE = (220, 220, 220)

COLOR_GOOD = (0, 220, 0)
COLOR_WARN = (0, 180, 255)
COLOR_BAD = (0, 0, 255)

VISIBILITY_THRESHOLD = 0.5
PRESENCE_THRESHOLD = 0.5
JOINT_RADIUS = 6
HAND_JOINT_RADIUS = 4
BONE_THICKNESS = 2

# Key joints to label on screen to reduce clutter.
LABELED_JOINTS = {
    0: "nose",
    11: "L shoulder", 12: "R shoulder",
    13: "L elbow", 14: "R elbow",
    15: "L wrist", 16: "R wrist",
    23: "L hip", 24: "R hip",
    25: "L knee", 26: "R knee",
    27: "L ankle", 28: "R ankle",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def download_model(url: str, dest: str) -> None:
    """Download the model bundle if it doesn't already exist."""
    import pathlib
    if pathlib.Path(dest).exists():
        return
    print(f"Downloading model to {dest} ...")
    import subprocess
    try:
        subprocess.run(["curl", "-L", "-o", dest, url], check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        import urllib.request
        urllib.request.urlretrieve(url, dest)
    print("Download complete.")


def angle_between(a, b, c) -> float:
    """Return the angle (degrees) at joint *b* formed by points a-b-c."""
    ba = np.array([a.x - b.x, a.y - b.y])
    bc = np.array([c.x - b.x, c.y - b.y])
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return math.degrees(math.acos(np.clip(cos_angle, -1.0, 1.0)))


def torso_lean_angle(landmarks) -> float | None:
    """Return how many degrees the torso leans from vertical.

    Uses the midpoint of shoulders (11,12) and hips (23,24).
    Returns None if landmarks aren't visible enough.
    """
    ids = (11, 12, 23, 24)
    if any(landmarks[i].visibility is None or landmarks[i].visibility < VISIBILITY_THRESHOLD
           for i in ids):
        return None
    mid_sh = np.array([
        (landmarks[11].x + landmarks[12].x) / 2,
        (landmarks[11].y + landmarks[12].y) / 2,
    ])
    mid_hp = np.array([
        (landmarks[23].x + landmarks[24].x) / 2,
        (landmarks[23].y + landmarks[24].y) / 2,
    ])
    torso = mid_sh - mid_hp  # points upward (y decreases)
    vertical = np.array([0.0, -1.0])
    cos_a = np.dot(torso, vertical) / (np.linalg.norm(torso) + 1e-8)
    return math.degrees(math.acos(np.clip(cos_a, -1.0, 1.0)))


# ---------------------------------------------------------------------------
# Bicep-curl tracker
# ---------------------------------------------------------------------------

# Feedback severity levels used for coloring and priority ordering.
SEV_GOOD = "good"
SEV_INFO = "info"
SEV_WARN = "warn"
SEV_BAD = "bad"

SEV_PRIORITY = {SEV_BAD: 0, SEV_WARN: 1, SEV_INFO: 2, SEV_GOOD: 3}

SEV_COLORS = {
    SEV_GOOD: COLOR_GOOD,
    SEV_INFO: COLOR_TEXT,
    SEV_WARN: COLOR_WARN,
    SEV_BAD: COLOR_BAD,
}


class CurlTracker:
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
    """

    PHASE_DOWN = "down"
    PHASE_UP = "up"

    CURL_TOP = 60
    CURL_BOTTOM = 140

    # --- Scoring weights (should sum to ~100) ---
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

    # --- Thresholds ---
    # Shoulder swing (elbow-shoulder-hip angle)
    SWING_OK = 15
    SWING_WARN = 30
    SWING_BAD = 45

    # Body lean (degrees from vertical)
    LEAN_OK = 10
    LEAN_WARN = 18
    LEAN_BAD = 28

    # ROM
    ROM_TOP_GOOD = 50
    ROM_TOP_OK = 70
    ROM_BOTTOM_GOOD = 155
    ROM_BOTTOM_OK = 130

    # Wrist deviation from straight (180°)
    WRIST_DEV_OK = 15
    WRIST_DEV_WARN = 30

    # Shoulder shrug: when vertical distance between shoulder and ear
    # drops below this fraction of the reference distance, it's a shrug.
    SHRUG_RATIO_WARN = 0.65

    # Elbow flare: lateral distance (normalized coords) elbow vs hip.
    FLARE_OK = 0.05
    FLARE_WARN = 0.09

    # Supination: palm cross-vector ratio [-1 pronated, 0 neutral, +1 supinated].
    SUP_GOOD = 0.35       # above this = properly supinated
    SUP_NEUTRAL = 0.05    # below this = too neutral / hammer grip

    # Tempo (seconds)
    CON_MIN = 0.6
    CON_MAX = 3.0
    ECC_MIN = 1.0
    ECC_MAX = 4.5

    # How long an alert lingers after the issue stops being detected,
    # to avoid single-frame flicker.
    LIVE_GRACE = 0.35

    def __init__(self, side: str):
        self.side = side
        self.phase = self.PHASE_DOWN
        self.reps = 0

        # Per-rep accumulators
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

        # Reference shoulder-ear distance (calibrated from first few frames).
        self._ref_sh_ear: float = 0.0
        self._sh_ear_samples: list[float] = []

        # Current elbow angle for progress display
        self.cur_elbow: float = 180.0

        # Live alerts: {message: (severity, last_triggered_time)}
        self._live_triggers: dict[str, tuple[str, float]] = {}

        # End-of-rep results
        self.active_feedback: list[tuple[str, str]] = []
        self._feedback_expiry: float = 0.0
        self.last_score: int = 0
        self.rep_scores: list[int] = []

        # Speech queue (consumed one at a time by main loop)
        self._speech_queue: list[str] = []

    # ----- public API -----

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

        wrist_dev = 0.0
        if wrist_angle is not None:
            wrist_dev = abs(180.0 - wrist_angle)
            self._peak_wrist_dev = max(self._peak_wrist_dev, wrist_dev)

        if elbow_flare_dist is not None:
            self._peak_flare = max(self._peak_flare, elbow_flare_dist)

        if supination is not None:
            self._min_supination = min(self._min_supination, supination)

        self._update_shrug_ref(shoulder_ear_dist)

        # --- Live mid-rep alerts (appear/disappear in real time) ---
        if shoulder_angle > self.SWING_BAD:
            self._trigger("Pin elbow to side!", SEV_BAD, now)
        elif shoulder_angle > self.SWING_WARN:
            self._trigger("Elbow drifting", SEV_WARN, now)

        if body_lean is not None:
            if body_lean > self.LEAN_BAD:
                self._trigger("Stop leaning back!", SEV_BAD, now)
            elif body_lean > self.LEAN_WARN:
                self._trigger("Brace your core", SEV_WARN, now)

        # if wrist_dev > self.WRIST_DEV_WARN:
        #     self._trigger("Straighten wrist!", SEV_WARN, now)

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

    # --- Live alert helpers ---

    def _trigger(self, msg: str, sev: str, now: float) -> None:
        self._live_triggers[msg] = (sev, now)

    def get_live_alerts(self, now: float) -> list[tuple[str, str]]:
        """Return alerts that are currently active or within the grace window."""
        active = []
        expired_keys = []
        for msg, (sev, last_t) in self._live_triggers.items():
            if now - last_t <= self.LIVE_GRACE:
                active.append((msg, sev))
            else:
                expired_keys.append(msg)
        for k in expired_keys:
            del self._live_triggers[k]
        return active

    def get_feedback(self, now: float) -> list[tuple[str, str]]:
        if now < self._feedback_expiry:
            return self.active_feedback
        return []

    def take_speech(self) -> str | None:
        """Pop and return the next queued spoken issue, or None."""
        if self._speech_queue:
            return self._speech_queue.pop(0)
        return None

    @staticmethod
    def _build_speech_queue(
        issues: list[tuple[str, str]],
    ) -> list[str]:
        """Return individual spoken strings, most critical first."""
        voiced = [msg for msg, sev in issues if sev in (SEV_BAD, SEV_WARN)]
        return voiced if voiced else ["Good job!"]

    @property
    def avg_score(self) -> float:
        return sum(self.rep_scores) / len(self.rep_scores) if self.rep_scores else 0.0

    @property
    def progress(self) -> float:
        """0.0 = fully extended, 1.0 = fully curled."""
        raw = 1.0 - (self.cur_elbow - self.CURL_TOP) / max(
            self.CURL_BOTTOM - self.CURL_TOP, 1
        )
        return float(np.clip(raw, 0.0, 1.0))

    # ----- internals -----

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

        # 1. Elbow pinning
        if self._peak_swing > self.SWING_BAD:
            issues.append(("Elbow swinging a lot - pin it to your side", SEV_BAD))
            score -= self.W_ELBOW_PIN
        elif self._peak_swing > self.SWING_WARN:
            issues.append(("Elbow drifting forward - keep it pinned", SEV_WARN))
            score -= self.W_ELBOW_PIN // 2
        elif self._peak_swing > self.SWING_OK:
            issues.append(("Slight elbow drift - try to keep it tighter", SEV_INFO))
            score -= self.W_ELBOW_PIN // 4

        # 2. Body lean
        if self._peak_lean > self.LEAN_BAD:
            issues.append(("Too much body lean - you're using momentum", SEV_BAD))
            score -= self.W_LEAN
        elif self._peak_lean > self.LEAN_WARN:
            issues.append(("Leaning back a bit - brace your core", SEV_WARN))
            score -= self.W_LEAN // 2
        elif self._peak_lean > self.LEAN_OK:
            issues.append(("Minor torso sway detected", SEV_INFO))
            score -= self.W_LEAN // 4

        # 3. ROM top (peak contraction)
        if self._min_elbow > self.ROM_TOP_OK:
            issues.append(("Curl higher - squeeze at the top", SEV_WARN))
            score -= self.W_ROM_TOP
        elif self._min_elbow > self.ROM_TOP_GOOD:
            issues.append(("Almost full contraction - try to squeeze more", SEV_INFO))
            score -= self.W_ROM_TOP // 2

        # 4. ROM bottom (full extension)
        if self._max_elbow < self.ROM_BOTTOM_OK:
            issues.append(("Extend your arm more at the bottom", SEV_WARN))
            score -= self.W_ROM_BOTTOM
        elif self._max_elbow < self.ROM_BOTTOM_GOOD:
            issues.append(("Slightly short extension - straighten a bit more", SEV_INFO))
            score -= self.W_ROM_BOTTOM // 2

        # 5. Wrist alignment (disabled – too noisy with current model)
        # if self._peak_wrist_dev > self.WRIST_DEV_WARN:
        #     issues.append(("Keep wrist straight - don't curl your wrist", SEV_WARN))
        #     score -= self.W_WRIST
        # elif self._peak_wrist_dev > self.WRIST_DEV_OK:
        #     issues.append(("Slight wrist bend - keep it neutral", SEV_INFO))
        #     score -= self.W_WRIST // 2

        # 6. Shoulder shrug
        if self._shrug_detected:
            issues.append(("Shoulder hiking up - relax your traps", SEV_WARN))
            score -= self.W_SHRUG

        # 7. Elbow flare
        if self._peak_flare > self.FLARE_WARN:
            issues.append(("Elbow flaring out - keep it tucked in", SEV_WARN))
            score -= self.W_FLARE
        elif self._peak_flare > self.FLARE_OK:
            issues.append(("Slight elbow flare - tuck it closer", SEV_INFO))
            score -= self.W_FLARE // 2

        # 8. Supination
        if self._min_supination < self.SUP_NEUTRAL:
            issues.append(("Rotate palm up - supinate your grip", SEV_WARN))
            score -= self.W_SUPINATION
        elif self._min_supination < self.SUP_GOOD:
            issues.append(("Grip slightly neutral - supinate more", SEV_INFO))
            score -= self.W_SUPINATION // 2

        # 9. Tempo concentric
        if self._con_time > 0:
            if self._con_time < self.CON_MIN:
                issues.append(("Lifting too fast - slow down", SEV_WARN))
                score -= self.W_TEMPO_CON
            elif self._con_time > self.CON_MAX:
                issues.append(("Lifting too slow - may lose tension", SEV_WARN))
                score -= self.W_TEMPO_CON // 2

        # 9. Tempo eccentric
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

        # Sort issues: most severe first.
        issues.sort(key=lambda x: SEV_PRIORITY.get(x[1], 99))

        if not issues:
            self.active_feedback = [("Perfect rep!", SEV_GOOD)]
        else:
            self.active_feedback = issues
        self._feedback_expiry = now + 5.0

        self._speech_queue = self._build_speech_queue(issues)

        # Reset accumulators
        self._peak_swing = 0.0
        self._peak_lean = 0.0
        self._min_elbow = 180.0
        self._max_elbow = 0.0
        self._peak_wrist_dev = 0.0
        self._peak_flare = 0.0
        self._shrug_detected = False
        self._min_supination = 1.0
        self._con_time = 0.0


def _score_color(score: int) -> tuple[int, int, int]:
    if score >= 85:
        return COLOR_GOOD
    if score >= 60:
        return COLOR_WARN
    return COLOR_BAD


def _draw_progress_bar(
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
    trackers: dict[str, CurlTracker],
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

    # Draw all banner backgrounds on a single overlay, then blend once.
    overlay = frame.copy()
    for i, (_msg, sev) in enumerate(alerts):
        y = start_y + i * banner_h
        bg = (0, 0, 80) if sev == SEV_BAD else (0, 50, 80)
        cv2.rectangle(overlay, (0, y), (fw, y + banner_h), bg, -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    # Draw text on top of the blended frame.
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


def draw_curl_panel(
    frame: np.ndarray,
    trackers: dict[str, CurlTracker],
    angles: dict,
    now: float,
) -> None:
    """Draw the bicep-curl feedback panel on the left side of the frame."""
    fh, fw = frame.shape[:2]
    overlay = frame.copy()

    pad = 14
    line_h = 28
    bar_h = 14
    col_x = pad
    box_w = 380

    # Pre-compute all lines so we know the box height.
    # Each entry: ("text", color, is_bar, bar_progress, bar_color)
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

        # Header with score
        if t.reps > 0:
            sc = t.last_score
            text(
                f"{side} ARM   Reps: {t.reps}   Score: {sc}",
                _score_color(sc), 0.55, True,
            )
        else:
            text(f"{side} ARM   Reps: 0", COLOR_TEXT, 0.55, True)

        # Progress bar
        bar(t.progress, COLOR_GOOD if t.progress > 0.7 else COLOR_WARN)

        # Elbow angle
        elbow_val = angles.get(elbow_key)
        if elbow_val is not None:
            text(f"  Elbow: {elbow_val:.0f} deg   Phase: {t.phase}")

        # Average score
        if t.reps >= 2:
            text(f"  Avg score: {t.avg_score:.0f}   Best: {max(t.rep_scores)}", (180, 180, 180))

        # Feedback
        fb = t.get_feedback(now)
        if fb:
            for msg, sev in fb:
                prefix = "  " if sev == SEV_GOOD else "  ! "
                text(f"{prefix}{msg}", SEV_COLORS.get(sev, COLOR_TEXT))
        elif t.reps == 0:
            text("  Waiting for curl...", (120, 120, 120))

        spacer()

    # Compute box height
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
            _draw_progress_bar(frame, col_x, y, box_w - pad * 2, bar_h, extra, color)
            y += bar_h + 2
        elif kind == "spacer":
            y += 8


def draw_landmarks(frame: np.ndarray, landmarks, w: int, h: int) -> dict:
    """Draw skeleton overlay and return a dict of computed joint angles."""
    points = {}
    for idx, lm in enumerate(landmarks):
        cx, cy = int(lm.x * w), int(lm.y * h)
        points[idx] = (cx, cy, lm.visibility)

    # Draw bones
    for (i, j) in POSE_CONNECTIONS:
        if i in points and j in points:
            vi, vj = points[i][2], points[j][2]
            if vi > VISIBILITY_THRESHOLD and vj > VISIBILITY_THRESHOLD:
                cv2.line(
                    frame,
                    (points[i][0], points[i][1]),
                    (points[j][0], points[j][1]),
                    COLOR_BONE, BONE_THICKNESS, cv2.LINE_AA,
                )

    # Draw joints
    for idx, (cx, cy, vis) in points.items():
        if vis > VISIBILITY_THRESHOLD:
            color = COLOR_JOINT
        else:
            color = COLOR_LOW_CONF
        cv2.circle(frame, (cx, cy), JOINT_RADIUS, color, -1, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), JOINT_RADIUS, (0, 0, 0), 1, cv2.LINE_AA)

        if idx in LABELED_JOINTS and vis > VISIBILITY_THRESHOLD:
            cv2.putText(
                frame, LABELED_JOINTS[idx],
                (cx + 8, cy - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_TEXT, 1, cv2.LINE_AA,
            )

    angles = {}
    angle_defs = {
        "L elbow": (11, 13, 15),
        "R elbow": (12, 14, 16),
        "L knee": (23, 25, 27),
        "R knee": (24, 26, 28),
        "L shoulder": (13, 11, 23),
        "R shoulder": (14, 12, 24),
        "L wrist": (13, 15, 19),
        "R wrist": (14, 16, 20),
    }
    for name, (a, b, c) in angle_defs.items():
        if all(
            idx in points and points[idx][2] > VISIBILITY_THRESHOLD
            for idx in (a, b, c)
        ):
            angles[name] = angle_between(landmarks[a], landmarks[b], landmarks[c])

    return angles


def compute_supination(hand_landmarks, side: str) -> float | None:
    """Estimate forearm supination from the palm cross-vector.

    Uses the vector from pinky MCP (17) to index MCP (5) which runs
    across the palm base.  Returns a value in roughly [-1, 1]:
        +1  = fully supinated (palm up / facing camera)
         0  = neutral / hammer grip
        -1  = pronated (palm down)
    Returns None if landmarks are missing.

    *side* is our display side ("L" or "R"), already corrected for
    the mirrored selfie feed.
    """
    idx_mcp = hand_landmarks[5]
    pnk_mcp = hand_landmarks[17]
    pres_ok = (
        (idx_mcp.presence if idx_mcp.presence is not None else 1.0) > PRESENCE_THRESHOLD
        and (pnk_mcp.presence if pnk_mcp.presence is not None else 1.0) > PRESENCE_THRESHOLD
    )
    if not pres_ok:
        return None

    dx = idx_mcp.x - pnk_mcp.x
    dy = idx_mcp.y - pnk_mcp.y

    # Normalize so positive = supinated for both hands.
    # In mirrored selfie view, supinated L hand has index LEFT of pinky (dx < 0),
    # supinated R hand has index RIGHT of pinky (dx > 0).
    if side == "L":
        dx = -dx

    spread = math.hypot(dx, dy) + 1e-8
    # sup_ratio: +1 when palm cross-vector is perfectly horizontal toward
    # the supinated direction, 0 when vertical (neutral), -1 when pronated.
    sup_ratio = dx / spread
    return float(sup_ratio)


def draw_hand_landmarks(
    frame: np.ndarray, hand_landmarks_list, handedness_list,
    w: int, h: int,
) -> dict[str, float | None]:
    """Draw hand skeleton overlays.  Returns {side: supination_ratio}."""
    supination: dict[str, float | None] = {}

    for hand_landmarks, handedness in zip(hand_landmarks_list, handedness_list):
        label = handedness[0].category_name  # "Left" or "Right"
        # MediaPipe returns mirrored labels for a selfie-view feed, so we
        # swap to match the visual side on screen.
        side = "L" if label == "Right" else "R"
        color = COLOR_HAND_LEFT if side == "L" else COLOR_HAND_RIGHT

        sup = compute_supination(hand_landmarks, side)
        supination[side] = sup

        points = {}
        for idx, lm in enumerate(hand_landmarks):
            cx, cy = int(lm.x * w), int(lm.y * h)
            pres = lm.presence if lm.presence is not None else 1.0
            points[idx] = (cx, cy, pres)

        for (i, j) in HAND_CONNECTIONS:
            if i in points and j in points:
                if (points[i][2] > PRESENCE_THRESHOLD
                        and points[j][2] > PRESENCE_THRESHOLD):
                    cv2.line(
                        frame,
                        (points[i][0], points[i][1]),
                        (points[j][0], points[j][1]),
                        COLOR_HAND_BONE, 1, cv2.LINE_AA,
                    )

        for idx, (cx, cy, pres) in points.items():
            r = HAND_JOINT_RADIUS
            if pres > PRESENCE_THRESHOLD:
                cv2.circle(frame, (cx, cy), r, color, -1, cv2.LINE_AA)
                cv2.circle(frame, (cx, cy), r, (0, 0, 0), 1, cv2.LINE_AA)

                if idx in HAND_FINGERTIP_LABELS:
                    cv2.putText(
                        frame, HAND_FINGERTIP_LABELS[idx],
                        (cx + 6, cy - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, COLOR_TEXT, 1,
                        cv2.LINE_AA,
                    )

        # Label which hand + supination near the wrist.
        if 0 in points and points[0][2] > PRESENCE_THRESHOLD:
            wx, wy = points[0][0], points[0][1]
            sup_label = ""
            if sup is not None:
                if sup > 0.4:
                    sup_label = " sup"
                elif sup < -0.1:
                    sup_label = " pro"
                else:
                    sup_label = " neu"
            cv2.putText(
                frame, f"{side} hand{sup_label}",
                (wx + 8, wy + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
            )

    return supination


def draw_hud(frame: np.ndarray, fps: float, angles: dict) -> None:
    """Render a heads-up display with FPS and joint angles."""
    h, w = frame.shape[:2]
    overlay = frame.copy()

    pad = 10
    line_h = 22
    lines = [f"FPS: {fps:.1f}"] + [f"{k}: {v:.0f} deg" for k, v in angles.items()]
    box_h = pad * 2 + line_h * len(lines)
    box_w = 200

    cv2.rectangle(overlay, (w - box_w, 0), (w, box_h), COLOR_HUD, -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    for i, line in enumerate(lines):
        cv2.putText(
            frame, line,
            (w - box_w + pad, pad + line_h * (i + 1)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.48, COLOR_TEXT, 1, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> None:
    from tts import VoiceCoach
    voice = VoiceCoach()

    download_model(POSE_MODEL_URL, POSE_MODEL_PATH)
    download_model(HAND_MODEL_URL, HAND_MODEL_PATH)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    hand_options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=HAND_MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: cannot open webcam.")
        return

    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)
    curl_trackers: dict[str, CurlTracker] = {
        "L": CurlTracker("L"),
        "R": CurlTracker("R"),
    }
    prev_time = time.time()
    fps = 0.0
    frame_ts = 0

    print("Pose + hand tracker running. Press 'q' to quit.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        frame_ts += 33
        pose_result = pose_landmarker.detect_for_video(mp_image, frame_ts)
        hand_result = hand_landmarker.detect_for_video(mp_image, frame_ts)

        # Process hands first so supination data is available for curl tracker.
        hand_supination: dict[str, float | None] = {}
        if hand_result.hand_landmarks:
            hand_supination = draw_hand_landmarks(
                frame, hand_result.hand_landmarks,
                hand_result.handedness, w, h,
            )

        angles = {}
        if pose_result.pose_landmarks:
            lms = pose_result.pose_landmarks[0]
            angles = draw_landmarks(frame, lms, w, h)

            lean = torso_lean_angle(lms)
            now_t = time.time()

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
                if (lms[sh].visibility or 0) > VISIBILITY_THRESHOLD and \
                   (lms[ear].visibility or 0) > VISIBILITY_THRESHOLD:
                    sh_ear = abs(lms[sh].y - lms[ear].y)

                flare = None
                if (lms[el].visibility or 0) > VISIBILITY_THRESHOLD and \
                   (lms[hp].visibility or 0) > VISIBILITY_THRESHOLD:
                    flare = abs(lms[el].x - lms[hp].x)

                sup = hand_supination.get(side)
                curl_trackers[side].update(
                    elbow_a, shoulder_a, lean,
                    wrist_a, sh_ear, flare, sup, now_t,
                )

        # Send the most critical feedback to voice coach (non-blocking).
        if not voice.is_busy:
            for side in ("L", "R"):
                speech = curl_trackers[side].take_speech()
                if speech:
                    voice.say(speech)
                    break  # one message at a time

        now = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(now - prev_time, 1e-6))
        prev_time = now

        draw_curl_panel(frame, curl_trackers, angles, now)
        draw_live_alerts(frame, curl_trackers, now)
        draw_hud(frame, fps, angles)
        cv2.imshow("GymBuddy - Pose Tracker", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    pose_landmarker.close()
    hand_landmarker.close()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
