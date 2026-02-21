# GymBuddy - Pose Tracker

Real-time body joint tracking using [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker). Tracks 33 body landmarks via your webcam and displays a skeleton overlay with joint angles.

## Setup

**Requires Python 3.9 – 3.12.**

```bash
# Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

The model file (`pose_landmarker_lite.task`) is downloaded automatically on first run.

## Usage

```bash
python pose_tracker.py
```

- A window titled **GymBuddy - Pose Tracker** will open showing your webcam feed with skeleton overlay.
- The HUD in the top-right corner displays FPS and key joint angles (elbows, knees, shoulders).
- Red dots indicate low-confidence landmarks; green dots are high-confidence.
- Press **q** to quit.

## What's Tracked

| Landmark Group | Joints |
|---|---|
| Upper body | Shoulders, elbows, wrists |
| Lower body | Hips, knees, ankles |
| Head | Nose, eyes, ears, mouth |
| Extremities | Hands (pinky, index, thumb), feet (heel, toe) |

Joint angles are computed for left/right elbows, knees, and shoulders.
