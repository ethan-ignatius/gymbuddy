# GymBuddy - Hackalytics 2026

GymBuddy combines:
- A **real-time pose tracker** using [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- A **backend + frontend app** for signup, workout planning, scheduling, and SMS-based rescheduling

## App Setup (Backend + Frontend)

### Backend

Requirements: Node 18+, PostgreSQL.

1. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.
2. Run:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
# or: npx prisma db push
npm run dev
```

Backend runs on http://localhost:3000.

### Frontend

Run:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173 and proxies `/api` and `/webhooks` to the backend.

## API

- `POST /api/signup` — body: `{ email, phoneNumber, heightCm, weightKg, goal, gymTravelMinutes }`. Creates user, generates plan, schedules next week, returns JSON.
- `POST /webhooks/sms` — Twilio incoming SMS (e.g. “can’t make it” → reschedule).
- `POST /api/schedule-next-week` — body: `{ userId }`. Re-runs scheduling for that user (for testing).

## Pose Tracker Setup

**Requires Python 3.9 – 3.12.**

```bash
cd backend

# Create a virtual environment (recommended)
python3 -m venv .venv

# Activate (macOS/Linux)
source .venv/bin/activate

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

The model file (`pose_landmarker_lite.task`) is downloaded automatically on first run.

## Pose Tracker Usage

```bash
cd backend
python pose_tracker.py
```

- A window titled **GymBuddy - Pose Tracker** opens showing your webcam feed with skeleton overlay.
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
