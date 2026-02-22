"""
GymBuddy – Real-time pose + hand tracking with voice-controlled exercise coaching.

Main container that handles webcam, MediaPipe detection, rendering, voice
commands, and delegates exercise-specific analysis to modules in exercises/.
"""

import time
import math
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from exercises import (
    COLOR_GOOD, COLOR_WARN, COLOR_TEXT, COLOR_HUD, draw_live_alerts,
)
from exercises.bicep_curl import (
    CurlTracker,
    update_trackers as update_curl_trackers,
    draw_panel as draw_curl_panel,
)
from exercises.lateral_raise import (
    LateralRaiseTracker,
    update_trackers as update_raise_trackers,
    draw_panel as draw_raise_panel,
)
from llm_brain import LLMBrain, WorkoutContext
from supabase_store import SupabaseStore, ExerciseLog

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

POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7),
    (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10),
    (11, 12),
    (11, 13), (13, 15),
    (12, 14), (14, 16),
    (15, 17), (15, 19), (15, 21),
    (16, 18), (16, 20), (16, 22),
    (11, 23), (12, 24),
    (23, 24),
    (23, 25), (25, 27),
    (24, 26), (26, 28),
    (27, 29), (29, 31),
    (28, 30), (30, 32),
]

HAND_LANDMARK_NAMES = [
    "wrist",
    "thumb cmc", "thumb mcp", "thumb ip", "thumb tip",
    "index mcp", "index pip", "index dip", "index tip",
    "middle mcp", "middle pip", "middle dip", "middle tip",
    "ring mcp", "ring pip", "ring dip", "ring tip",
    "pinky mcp", "pinky pip", "pinky dip", "pinky tip",
]

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]

HAND_FINGERTIP_LABELS = {
    4: "thumb", 8: "index", 12: "middle", 16: "ring", 20: "pinky",
}

COLOR_JOINT = (0, 255, 128)
COLOR_BONE = (255, 200, 50)
COLOR_LOW_CONF = (0, 0, 255)
COLOR_HAND_LEFT = (255, 120, 50)
COLOR_HAND_RIGHT = (50, 200, 255)
COLOR_HAND_BONE = (220, 220, 220)

VISIBILITY_THRESHOLD = 0.5
PRESENCE_THRESHOLD = 0.5
JOINT_RADIUS = 6
HAND_JOINT_RADIUS = 4
BONE_THICKNESS = 2

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
    ba = np.array([a.x - b.x, a.y - b.y])
    bc = np.array([c.x - b.x, c.y - b.y])
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return math.degrees(math.acos(np.clip(cos_angle, -1.0, 1.0)))


def torso_lean_angle(landmarks) -> float | None:
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
    torso = mid_sh - mid_hp
    vertical = np.array([0.0, -1.0])
    cos_a = np.dot(torso, vertical) / (np.linalg.norm(torso) + 1e-8)
    return math.degrees(math.acos(np.clip(cos_a, -1.0, 1.0)))


# ---------------------------------------------------------------------------
# Skeleton / hand drawing
# ---------------------------------------------------------------------------


def draw_landmarks(frame: np.ndarray, landmarks, w: int, h: int) -> dict:
    points = {}
    for idx, lm in enumerate(landmarks):
        cx, cy = int(lm.x * w), int(lm.y * h)
        points[idx] = (cx, cy, lm.visibility)

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

    for idx, (cx, cy, vis) in points.items():
        color = COLOR_JOINT if vis > VISIBILITY_THRESHOLD else COLOR_LOW_CONF
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

    if side == "L":
        dx = -dx

    spread = math.hypot(dx, dy) + 1e-8
    return float(dx / spread)


def draw_hand_landmarks(
    frame: np.ndarray, hand_landmarks_list, handedness_list,
    w: int, h: int,
) -> dict[str, float | None]:
    supination: dict[str, float | None] = {}

    for hand_landmarks, handedness in zip(hand_landmarks_list, handedness_list):
        label = handedness[0].category_name
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
            if pres > PRESENCE_THRESHOLD:
                cv2.circle(frame, (cx, cy), HAND_JOINT_RADIUS, color, -1, cv2.LINE_AA)
                cv2.circle(frame, (cx, cy), HAND_JOINT_RADIUS, (0, 0, 0), 1, cv2.LINE_AA)

                if idx in HAND_FINGERTIP_LABELS:
                    cv2.putText(
                        frame, HAND_FINGERTIP_LABELS[idx],
                        (cx + 6, cy - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, COLOR_TEXT, 1,
                        cv2.LINE_AA,
                    )

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
# Workout routine (CSV-driven exercise queue)
# ---------------------------------------------------------------------------

import csv
from collections import deque
from dataclasses import dataclass


EXERCISE_NAMES = {
    "bicep_curl": "Bicep Curl",
    "lateral_raise": "Lateral Raise",
}

EXERCISE_STATES = {
    "bicep_curl": "bicep_curl",
    "lateral_raise": "lateral_raise",
}


@dataclass
class ExerciseConfig:
    exercise: str       # "bicep_curl", "lateral_raise"
    sets: int
    reps: int
    rest_seconds: float

    @property
    def display_name(self) -> str:
        return EXERCISE_NAMES.get(self.exercise, self.exercise)


class WorkoutRoutine:
    """Ordered queue of exercises loaded from CSV, with skip/delay support."""

    def __init__(self, exercises: list[ExerciseConfig]) -> None:
        self._queue: deque[ExerciseConfig] = deque(exercises)
        self._total = len(exercises)
        self._completed = 0
        self.current: ExerciseConfig | None = None
        self.done = False

    @staticmethod
    def from_csv(path: str) -> "WorkoutRoutine":
        exercises = []
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                ex = ExerciseConfig(
                    exercise=row["exercise"].strip(),
                    sets=int(row["sets"]),
                    reps=int(row["reps"]),
                    rest_seconds=float(row["rest_seconds"]),
                )
                if ex.exercise in EXERCISE_STATES:
                    exercises.append(ex)
                else:
                    print(f"Warning: unknown exercise '{ex.exercise}' in CSV, skipping.")
        return WorkoutRoutine(exercises)

    @property
    def remaining(self) -> int:
        return len(self._queue)

    @property
    def progress_str(self) -> str:
        return f"{self._completed}/{self._total}"

    def advance(self) -> ExerciseConfig | None:
        """Move to the next exercise. Returns None when all are done."""
        if not self._queue:
            self.done = True
            self.current = None
            return None
        self.current = self._queue.popleft()
        return self.current

    def complete_current(self) -> None:
        self._completed += 1
        self.current = None

    def skip_current(self) -> None:
        """Move the current exercise to the end of the queue."""
        if self.current:
            self._queue.append(self.current)
            self.current = None

    def summary(self) -> list[str]:
        """Return a list of upcoming exercise names for display."""
        items = []
        if self.current:
            items.append(f"> {self.current.display_name} (current)")
        for ex in self._queue:
            items.append(f"  {ex.display_name}")
        return items


# ---------------------------------------------------------------------------
# Workout session (set / rest management for one exercise)
# ---------------------------------------------------------------------------


class WorkoutSession:
    """Manages sets, rest periods, and rep goals for one exercise block."""

    def __init__(self, config: ExerciseConfig) -> None:
        self.reps_per_set = config.reps
        self.rest_seconds = config.rest_seconds
        self.total_sets = config.sets

        self.current_set = 0
        self.resting = False
        self._rest_start: float = 0.0
        self._rest_warned = False
        self._finished = False

    @property
    def finished(self) -> bool:
        return self._finished

    @property
    def rest_remaining(self) -> float:
        if not self.resting:
            return 0.0
        return max(0.0, self.rest_seconds - (time.time() - self._rest_start))

    def start(self) -> None:
        self.current_set = 1
        self.resting = False
        self._finished = False
        self._rest_warned = False

    def check_set_complete(self, trackers: dict) -> bool:
        if self.resting or self._finished:
            return False
        for t in trackers.values():
            if t.reps >= self.reps_per_set:
                return True
        return False

    def begin_rest(self) -> None:
        self.resting = True
        self._rest_start = time.time()
        self._rest_warned = False

    def check_rest_done(self) -> bool:
        if not self.resting:
            return False
        return self.rest_remaining <= 0.0

    def advance_set(self) -> bool:
        self.resting = False
        self.current_set += 1
        if self.current_set > self.total_sets:
            self._finished = True
            return False
        return True

    def should_warn_rest_break(self) -> bool:
        if not self.resting or self._rest_warned:
            return False
        self._rest_warned = True
        return True

    def reset_rest_warn(self) -> None:
        self._rest_warned = False


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

STATE_IDLE = "idle"
STATE_ANNOUNCE = "announce"
STATE_CURL = "bicep_curl"
STATE_RAISE = "lateral_raise"
STATE_REST = "resting"


def _state_label(
    state: str, session: "WorkoutSession | None",
    routine: "WorkoutRoutine | None",
) -> str:
    if state == STATE_IDLE:
        return "IDLE - Say 'start workout' or an exercise name"
    if state == STATE_ANNOUNCE and routine and routine.current:
        return f"UP NEXT: {routine.current.display_name} - Say 'start' or 'skip'"
    if state == STATE_REST and session:
        rem = int(session.rest_remaining)
        return f"REST  {rem}s  (Set {session.current_set}/{session.total_sets})"
    ex_name = EXERCISE_NAMES.get(state, state.upper())
    set_info = ""
    if session:
        set_info = f"  Set {session.current_set}/{session.total_sets}"
    rout_info = ""
    if routine:
        rout_info = f"  [{routine.progress_str}]"
    return f"{ex_name}{set_info}{rout_info} - Say 'stop' to end"


def draw_state_bar(
    frame: np.ndarray, state: str, session: "WorkoutSession | None",
    routine: "WorkoutRoutine | None",
    listener_active: bool, processing: bool,
    voice_mode: str = "",
) -> None:
    fh, fw = frame.shape[:2]
    bar_h = 44
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, fh - bar_h), (fw, fh), COLOR_HUD, -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    label = _state_label(state, session, routine)
    cv2.putText(
        frame, label, (14, fh - 14),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLOR_TEXT, 2, cv2.LINE_AA,
    )

    right_x = fw - 14
    if listener_active:
        indicator = "Processing..." if processing else "Listening..."
        color = COLOR_WARN if processing else COLOR_GOOD
        text_size = cv2.getTextSize(indicator, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
        right_x = fw - text_size[0] - 14
        cv2.putText(
            frame, indicator, (right_x, fh - 16),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
        )

    if voice_mode:
        mode_size = cv2.getTextSize(voice_mode, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)[0]
        mx = right_x - mode_size[0] - 16
        cv2.putText(
            frame, voice_mode, (mx, fh - 16),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1, cv2.LINE_AA,
        )


def draw_rest_overlay(frame: np.ndarray, session: WorkoutSession) -> None:
    fh, fw = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, fh // 3), (fw, fh * 2 // 3), COLOR_HUD, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    rem = int(session.rest_remaining)
    minutes = rem // 60
    seconds = rem % 60
    time_str = f"{minutes}:{seconds:02d}" if minutes else f"{seconds}s"

    title = "REST"
    set_info = f"Set {session.current_set}/{session.total_sets} complete"

    for txt, y_off, scale, thickness in [
        (title, -30, 1.4, 3),
        (time_str, 30, 1.8, 4),
        (set_info, 80, 0.7, 2),
    ]:
        sz = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)[0]
        tx = (fw - sz[0]) // 2
        ty = fh // 2 + y_off
        cv2.putText(
            frame, txt, (tx, ty),
            cv2.FONT_HERSHEY_SIMPLEX, scale, COLOR_TEXT, thickness, cv2.LINE_AA,
        )


def draw_announce_overlay(
    frame: np.ndarray, routine: WorkoutRoutine,
) -> None:
    """Show upcoming exercise + queue on screen while waiting for 'start'."""
    fh, fw = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, fh // 4), (fw, fh * 3 // 4), COLOR_HUD, -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    cfg = routine.current
    if not cfg:
        return

    lines = [
        (f"NEXT: {cfg.display_name}", 1.1, 3, COLOR_TEXT),
        (f"{cfg.sets} sets x {cfg.reps} reps   |   {int(cfg.rest_seconds)}s rest", 0.65, 2, COLOR_WARN),
        ("", 0.5, 1, COLOR_TEXT),
        ("Say 'start' to begin  |  'skip' to do later", 0.55, 1, COLOR_GOOD),
    ]

    upcoming = [ex.display_name for ex in routine._queue]
    if upcoming:
        lines.append(("", 0.4, 1, COLOR_TEXT))
        lines.append((f"Coming up: {', '.join(upcoming)}", 0.5, 1, (150, 150, 150)))

    total_h = sum(40 if s == 1.1 else 30 for _, s, *_ in lines)
    y = fh // 2 - total_h // 2

    for txt, scale, thickness, color in lines:
        if not txt:
            y += 15
            continue
        sz = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)[0]
        tx = (fw - sz[0]) // 2
        y += int(40 if scale > 1.0 else 30)
        cv2.putText(
            frame, txt, (tx, y),
            cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


DEFAULT_WORKOUT = "workouts/example_day.csv"


def _make_trackers(exercise_state: str) -> dict:
    if exercise_state == STATE_CURL:
        return {"L": CurlTracker("L"), "R": CurlTracker("R")}
    if exercise_state == STATE_RAISE:
        return {"L": LateralRaiseTracker("L"), "R": LateralRaiseTracker("R")}
    return {}


def _exercise_is_active(angles: dict, exercise_state: str) -> bool:
    if exercise_state == STATE_CURL:
        for side in ("L", "R"):
            ea = angles.get(f"{side} elbow")
            if ea is not None and ea < 90:
                return True
    elif exercise_state == STATE_RAISE:
        for side in ("L", "R"):
            sa = angles.get(f"{side} shoulder")
            if sa is not None and sa > 50:
                return True
    return False


def _go_idle() -> tuple[str, str, dict, "WorkoutSession | None", "WorkoutRoutine | None"]:
    return STATE_IDLE, STATE_IDLE, {}, None, None


def _respond(voice, llm_response: str | None, default: str, info: str = ""):
    """Speak the LLM's response (or *default*) with optional appended *info*."""
    base = llm_response or default
    voice.say(f"{base} {info}".rstrip() if info else base)


def _start_exercise(
    config: ExerciseConfig,
) -> tuple[str, dict, WorkoutSession]:
    """Begin an exercise block from its config."""
    ex_state = EXERCISE_STATES[config.exercise]
    trackers = _make_trackers(ex_state)
    session = WorkoutSession(config)
    session.start()
    return ex_state, trackers, session


def main(workout_csv: str = DEFAULT_WORKOUT) -> None:
    from tts import VoiceCoach
    from voice_command import VoiceCommandListener

    voice = VoiceCoach()
    brain = LLMBrain()
    db = SupabaseStore()

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

    trackers: dict = {}
    state = STATE_IDLE
    exercise_type = STATE_IDLE
    session: WorkoutSession | None = None
    routine: WorkoutRoutine | None = None
    exercise_log: ExerciseLog | None = None

    def get_workout_context() -> WorkoutContext:
        """Build a context snapshot for the LLM (called from background thread)."""
        ctx = WorkoutContext(state=state)
        if state == STATE_IDLE:
            ctx.available_commands = [
                "start_workout", "start_bicep_curl", "start_lateral_raise",
            ]
        elif state == STATE_ANNOUNCE:
            ctx.available_commands = ["ready", "skip", "stop"]
            if routine and routine.current:
                ctx.exercise = routine.current.display_name
        elif state in (STATE_CURL, STATE_RAISE):
            ctx.available_commands = ["stop"]
            ctx.exercise = EXERCISE_NAMES.get(state, state)
            if session:
                ctx.current_set = session.current_set
                ctx.total_sets = session.total_sets
                ctx.target_reps = session.reps_per_set
                ctx.reps = {s: t.reps for s, t in trackers.items()}
        elif state == STATE_REST:
            ctx.available_commands = ["stop"]
            if session:
                ctx.current_set = session.current_set
                ctx.total_sets = session.total_sets
                ctx.rest_remaining = session.rest_remaining
        if routine:
            ctx.routine_progress = routine.progress_str
        return ctx

    listener = VoiceCommandListener(
        is_speaking_fn=lambda: voice.is_busy,
        llm_brain=brain,
        get_context_fn=get_workout_context,
    )
    listener.start()

    prev_time = time.time()
    fps = 0.0
    frame_ts = 0

    print("GymBuddy ready. Say 'start workout' or an exercise name. Press 'q' to quit, 'm' to toggle voice mode.")
    voice.say("Gym Buddy ready. Say start workout to begin your routine.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]

        # --- Voice commands ---
        result = listener.get_command()
        cmd = result.intent if result else None
        llm_resp = result.response if result else None

        # Capture weight if the LLM extracted one from the user's speech
        if result and result.weight_lbs is not None and exercise_log is not None:
            exercise_log.weight_lbs = result.weight_lbs
            print(f"[weight] Recorded: {result.weight_lbs} lbs")

        # Pure conversation (no command intent) – speak the LLM response
        if result and not cmd and llm_resp:
            voice.say(llm_resp)

        if cmd == "stop":
            if state != STATE_IDLE:
                if exercise_log and trackers:
                    exercise_log.record_set(trackers)
                    db.save_exercise_log(exercise_log)
                exercise_log = None
                _respond(voice, llm_resp, "Workout stopped.")
                print("[state] -> IDLE (stopped)")
            state, exercise_type, trackers, session, routine = _go_idle()

        elif state == STATE_IDLE:
            if cmd == "start_workout":
                import pathlib
                if not pathlib.Path(workout_csv).exists():
                    _respond(voice, llm_resp, "Workout file not found.")
                    print(f"[error] {workout_csv} not found")
                else:
                    routine = WorkoutRoutine.from_csv(workout_csv)
                    cfg = routine.advance()
                    if cfg:
                        state = STATE_ANNOUNCE
                        exercise_log = ExerciseLog(exercise=cfg.exercise)
                        _respond(
                            voice, llm_resp, "Starting workout.",
                            f"First up: {cfg.display_name}. "
                            f"{cfg.sets} sets of {cfg.reps} reps. "
                            f"Say start when ready, or start with your weight, like start 20 pounds. Skip to do later.",
                        )
                        print(f"[state] -> ANNOUNCE: {cfg.display_name}")
                    else:
                        _respond(voice, llm_resp, "Workout file is empty.")
                        routine = None

            elif cmd in ("start_bicep_curl", "start_lateral_raise"):
                exercise_type = STATE_CURL if cmd == "start_bicep_curl" else STATE_RAISE
                cfg = ExerciseConfig(
                    exercise="bicep_curl" if exercise_type == STATE_CURL else "lateral_raise",
                    sets=3, reps=8, rest_seconds=60.0,
                )
                exercise_log = ExerciseLog(exercise=cfg.exercise)
                if result and result.weight_lbs is not None:
                    exercise_log.weight_lbs = result.weight_lbs
                state, trackers, session = _start_exercise(cfg)
                exercise_type = state
                _respond(
                    voice, llm_resp,
                    f"Starting {cfg.display_name}.",
                    f"Set 1 of {cfg.sets}. Say your weight anytime, like 20 pounds.",
                )
                print(f"[state] -> {cfg.display_name.upper()} (ad-hoc)")

        elif state == STATE_ANNOUNCE:
            # Capture weight during ANNOUNCE even without an intent
            if result and result.weight_lbs is not None and exercise_log is not None:
                exercise_log.weight_lbs = result.weight_lbs

            is_go = cmd in ("ready", "start_bicep_curl", "start_lateral_raise")
            if is_go and routine and routine.current:
                cfg = routine.current
                if exercise_log is None:
                    exercise_log = ExerciseLog(exercise=cfg.exercise)
                if result and result.weight_lbs is not None:
                    exercise_log.weight_lbs = result.weight_lbs
                state, trackers, session = _start_exercise(cfg)
                exercise_type = state
                weight_note = ""
                if exercise_log.weight_lbs:
                    weight_note = f" at {exercise_log.weight_lbs} lbs."
                _respond(
                    voice, llm_resp, "Let's go!",
                    f"{cfg.display_name}, set 1 of {cfg.sets}{weight_note}",
                )
                print(f"[state] -> {cfg.display_name.upper()} (set 1/{cfg.sets})")

            elif cmd == "skip" and routine:
                skipped = routine.current
                exercise_log = None
                routine.skip_current()
                nxt = routine.advance()
                if nxt:
                    state = STATE_ANNOUNCE
                    exercise_log = ExerciseLog(exercise=nxt.exercise)
                    _respond(
                        voice, llm_resp,
                        f"Skipped {skipped.display_name}.",
                        f"Next: {nxt.display_name}. "
                        f"{nxt.sets} sets of {nxt.reps}. "
                        f"Say start or start with weight, like start 20 pounds. Skip to do later.",
                    )
                    print(f"[state] -> ANNOUNCE: {nxt.display_name} (skipped {skipped.display_name})")
                else:
                    _respond(voice, llm_resp, "No more exercises. Workout done!")
                    exercise_log = None
                    state, exercise_type, trackers, session, routine = _go_idle()

        # --- Detection ---
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        frame_ts += 33
        pose_result = pose_landmarker.detect_for_video(mp_image, frame_ts)
        hand_result = hand_landmarker.detect_for_video(mp_image, frame_ts)

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

            if state == STATE_CURL:
                lean = torso_lean_angle(lms)
                now_t = time.time()
                update_curl_trackers(trackers, lms, angles, hand_supination, lean, now_t)
            elif state == STATE_RAISE:
                lean = torso_lean_angle(lms)
                now_t = time.time()
                update_raise_trackers(trackers, lms, angles, lean, now_t)

        # --- Set / rest management ---
        if session and not session.finished:
            if state == STATE_REST:
                if _exercise_is_active(angles, exercise_type) and not voice.is_busy:
                    if session.should_warn_rest_break():
                        rem = int(session.rest_remaining)
                        voice.say(f"Take more time to rest. {rem} seconds remaining.")
                    session.reset_rest_warn()

                if session.check_rest_done():
                    if session.advance_set():
                        trackers = _make_trackers(exercise_type)
                        state = exercise_type
                        voice.say(f"Rest over. Set {session.current_set} of {session.total_sets}. Let's go!")
                        print(f"[state] -> SET {session.current_set}/{session.total_sets}")
                    else:
                        # All sets done for this exercise – save performance
                        if exercise_log:
                            db.save_exercise_log(exercise_log)
                            exercise_log = None
                        if routine:
                            routine.complete_current()
                            nxt = routine.advance()
                            if nxt:
                                state = STATE_ANNOUNCE
                                session = None
                                trackers = {}
                                exercise_log = ExerciseLog(exercise=nxt.exercise)
                                voice.say(
                                    f"Exercise complete! Next: {nxt.display_name}. "
                                    f"{nxt.sets} sets of {nxt.reps}. "
                                    f"Say start when ready, or start with your weight. Skip to do later."
                                )
                                print(f"[state] -> ANNOUNCE: {nxt.display_name}")
                            else:
                                voice.say("All exercises complete. Great workout!")
                                print("[state] -> IDLE (routine complete)")
                                state, exercise_type, trackers, session, routine = _go_idle()
                        else:
                            voice.say("All sets complete. Great workout!")
                            print("[state] -> IDLE (exercise complete)")
                            state, exercise_type, trackers, session, routine = _go_idle()

            elif state in (STATE_CURL, STATE_RAISE) and session.check_set_complete(trackers):
                if exercise_log:
                    exercise_log.record_set(trackers)
                session.begin_rest()
                state = STATE_REST
                voice.say(f"Set {session.current_set} done! Rest for {int(session.rest_seconds)} seconds.")
                print(f"[state] -> REST (set {session.current_set} done)")

        # --- Voice coach (only during active exercise) ---
        if state in (STATE_CURL, STATE_RAISE) and not voice.is_busy:
            for side in ("L", "R"):
                if side in trackers:
                    speech = trackers[side].take_speech()
                    if speech:
                        voice.say(speech)
                        break

        now = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(now - prev_time, 1e-6))
        prev_time = now

        # --- Draw overlays ---
        if state == STATE_CURL:
            draw_curl_panel(frame, trackers, angles, now)
            draw_live_alerts(frame, trackers, now)
        elif state == STATE_RAISE:
            draw_raise_panel(frame, trackers, angles, now)
            draw_live_alerts(frame, trackers, now)
        elif state == STATE_REST and session:
            draw_rest_overlay(frame, session)
        elif state == STATE_ANNOUNCE and routine:
            draw_announce_overlay(frame, routine)

        # --- Injury warning banner ---
        if state in (STATE_CURL, STATE_RAISE) and any(
            t.injury_warning for t in trackers.values()
        ):
            fh, fw = frame.shape[:2]
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, 0), (fw, 48), (0, 0, 160), -1)
            cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
            warn_text = "INJURY RISK - Fix your form or lower the weight!"
            sz = cv2.getTextSize(warn_text, cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)[0]
            tx = (fw - sz[0]) // 2
            cv2.putText(
                frame, warn_text, (tx, 33),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA,
            )

        mode_label = "[LLM]" if listener.use_llm_only else "[Keyword]"
        draw_state_bar(
            frame, state, session, routine,
            listener.is_listening, listener.is_processing,
            voice_mode=mode_label,
        )
        draw_hud(frame, fps, angles)
        cv2.imshow("GymBuddy - Pose Tracker", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("m"):
            listener.use_llm_only = not listener.use_llm_only
            tag = "LLM" if listener.use_llm_only else "Keyword"
            print(f"[mode] Voice mode switched to: {tag}")
            voice.say(f"Switched to {tag} mode.")

    listener.stop()
    pose_landmarker.close()
    hand_landmarker.close()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="GymBuddy Pose Tracker")
    parser.add_argument(
        "--workout", type=str, default=DEFAULT_WORKOUT,
        help=f"Path to workout CSV (default: {DEFAULT_WORKOUT})",
    )
    args = parser.parse_args()
    main(workout_csv=args.workout)
