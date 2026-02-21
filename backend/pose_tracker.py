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
# Workout session (set / rest management)
# ---------------------------------------------------------------------------


class WorkoutSession:
    """Manages sets, rest periods, and rep goals for any exercise."""

    def __init__(
        self,
        reps_per_set: int = 8,
        rest_seconds: float = 60.0,
        total_sets: int = 3,
    ) -> None:
        self.reps_per_set = reps_per_set
        self.rest_seconds = rest_seconds
        self.total_sets = total_sets

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
        """Return True if either arm hit the rep target this frame."""
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
        """Move to the next set. Returns False if all sets are done."""
        self.resting = False
        self.current_set += 1
        if self.current_set > self.total_sets:
            self._finished = True
            return False
        return True

    def should_warn_rest_break(self) -> bool:
        """Returns True once per rest period if the user should be warned."""
        if not self.resting or self._rest_warned:
            return False
        self._rest_warned = True
        return True

    def reset_rest_warn(self) -> None:
        """Allow another rest-break warning (call when movement detected)."""
        self._rest_warned = False


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

STATE_IDLE = "idle"
STATE_CURL = "bicep_curl"
STATE_RAISE = "lateral_raise"
STATE_REST = "resting"


def _state_label(state: str, session: "WorkoutSession | None") -> str:
    if state == STATE_IDLE:
        return "IDLE - Say an exercise to start"
    if state == STATE_REST and session:
        rem = int(session.rest_remaining)
        return f"REST  {rem}s remaining  (Set {session.current_set}/{session.total_sets})"
    ex_name = "BICEP CURL" if state == STATE_CURL else "LATERAL RAISE"
    set_info = ""
    if session:
        set_info = f"  Set {session.current_set}/{session.total_sets}"
    return f"{ex_name}{set_info} - Say 'stop' to end"


def draw_state_bar(
    frame: np.ndarray, state: str, session: "WorkoutSession | None",
    listener_active: bool, processing: bool,
) -> None:
    fh, fw = frame.shape[:2]
    bar_h = 44
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, fh - bar_h), (fw, fh), COLOR_HUD, -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    label = _state_label(state, session)
    cv2.putText(
        frame, label, (14, fh - 14),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLOR_TEXT, 2, cv2.LINE_AA,
    )

    if listener_active:
        indicator = "Processing..." if processing else "Listening..."
        color = COLOR_WARN if processing else COLOR_GOOD
        text_size = cv2.getTextSize(indicator, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
        cv2.putText(
            frame, indicator, (fw - text_size[0] - 14, fh - 16),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
        )


def draw_rest_overlay(frame: np.ndarray, session: WorkoutSession) -> None:
    """Large centered rest countdown overlay."""
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


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def _make_trackers(exercise_state: str) -> dict:
    if exercise_state == STATE_CURL:
        return {"L": CurlTracker("L"), "R": CurlTracker("R")}
    if exercise_state == STATE_RAISE:
        return {"L": LateralRaiseTracker("L"), "R": LateralRaiseTracker("R")}
    return {}


def _exercise_is_active(angles: dict, exercise_state: str) -> bool:
    """Heuristic: is the user performing reps during rest?"""
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


def main(
    reps_per_set: int = 8,
    rest_seconds: float = 60.0,
    total_sets: int = 3,
) -> None:
    from tts import VoiceCoach
    from voice_command import VoiceCommandListener

    voice = VoiceCoach()
    listener = VoiceCommandListener(is_speaking_fn=lambda: voice.is_busy)
    listener.start()

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

    prev_time = time.time()
    fps = 0.0
    frame_ts = 0

    print("GymBuddy ready. Say an exercise to start. Press 'q' to quit.")
    print(f"  Config: {reps_per_set} reps/set, {rest_seconds:.0f}s rest, {total_sets} sets")
    voice.say("Gym Buddy ready. Tell me which exercise you want to do.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]

        # --- Voice commands ---
        cmd = listener.get_command()
        if state == STATE_IDLE:
            if cmd in ("start_bicep_curl", "start_lateral_raise"):
                exercise_type = STATE_CURL if cmd == "start_bicep_curl" else STATE_RAISE
                state = exercise_type
                trackers = _make_trackers(exercise_type)
                session = WorkoutSession(reps_per_set, rest_seconds, total_sets)
                session.start()
                name = "bicep curl" if exercise_type == STATE_CURL else "lateral raise"
                voice.say(f"Starting {name}. Set 1 of {total_sets}.")
                print(f"[state] -> {name.upper()} (set 1/{total_sets})")
        elif cmd == "stop":
            voice.say("Stopping analysis.")
            print("[state] -> IDLE")
            state = STATE_IDLE
            exercise_type = STATE_IDLE
            trackers = {}
            session = None

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
                        print(f"[rest] Movement detected – warned user ({rem}s left)")
                    session.reset_rest_warn()

                if session.check_rest_done():
                    if session.advance_set():
                        trackers = _make_trackers(exercise_type)
                        state = exercise_type
                        voice.say(f"Rest over. Set {session.current_set} of {session.total_sets}. Let's go!")
                        print(f"[state] -> SET {session.current_set}/{session.total_sets}")
                    else:
                        voice.say("All sets complete. Great workout!")
                        print("[state] -> IDLE (workout complete)")
                        state = STATE_IDLE
                        exercise_type = STATE_IDLE
                        trackers = {}
                        session = None

            elif state in (STATE_CURL, STATE_RAISE) and session.check_set_complete(trackers):
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

        draw_state_bar(frame, state, session, listener.is_listening, listener.is_processing)
        draw_hud(frame, fps, angles)
        cv2.imshow("GymBuddy - Pose Tracker", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    listener.stop()
    pose_landmarker.close()
    hand_landmarker.close()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="GymBuddy Pose Tracker")
    parser.add_argument("--reps", type=int, default=8, help="Reps per set (default: 8)")
    parser.add_argument("--rest", type=float, default=60.0, help="Rest between sets in seconds (default: 60)")
    parser.add_argument("--sets", type=int, default=3, help="Total sets (default: 3)")
    args = parser.parse_args()
    main(reps_per_set=args.reps, rest_seconds=args.rest, total_sets=args.sets)
