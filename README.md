# GymBuddy

GymBuddy is a full-stack fitness coaching prototype that combines:
- **Real-time pose tracking / AR-style form guidance** (MediaPipe + Python)
- **Conversational coaching** (OpenAI)
- **Workout scheduling + onboarding** (Node/Express + Prisma/Supabase + Google Calendar)
- **Voice agent / reminders** (Twilio + TTS)

## Run (Quick Start)

### 1. Backend (Node/Express API)

Requirements:
- `Node.js 18+`
- PostgreSQL (or Supabase Postgres)

Setup:
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
# or: npx prisma db push
npm run dev
```

Backend runs on `http://localhost:3000`.

Env:
- Copy `backend/.env.example` to `backend/.env`
- Set at minimum:
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
- Optional but used by major features:
  - `TWILIO_*`
  - `GOOGLE_*`
  - `ELEVENLABS_API_KEY`
  - `BASE_URL` (public URL for Twilio/Google callbacks, e.g. ngrok)

### 2. Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies `/api` + `/webhooks` to the backend.

### 3. Pose Tracker (Python)

Requirements:
- `Python 3.9-3.12`

Setup:
```bash
cd backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

# macOS/Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

Run:
```bash
cd backend
python pose_tracker.py
```

Notes:
- Model assets download automatically on first run.
- Press `q` to quit the local pose tracker window (if running in windowed mode).

### 4. (Optional) Actian RAG for Health PDFs

Start Actian VectorAI DB (from the Actian repo directory that contains `docker-compose.yml`):
```bash
docker compose up -d
```

Index PDFs placed in `backend/health_pdfs/`:
```bash
cd backend
python scripts/index_health_pdfs.py
```

## Core Workflow

1. User signs up and connects Google Calendar
2. GymBuddy onboards via voice/text
3. Scheduler creates conflict-aware workout slots
4. Pose tracker guides reps in real time
5. Dashboard shows workouts, history, attendance, and AI chat with RAG citations

## What Inspired Us

We started from a simple problem: many people want to work out consistently, but gyms feel intimidating, unsafe, and confusing - especially for beginners. Social media advice can be inconsistent or harmful, and many users do not have access to reliable coaching.

At the same time, AR-style interfaces, wearable hardware, and on-device AI are becoming more practical. GymBuddy came from the idea that first-rep guidance should be accessible, immediate, and confidence-building - without requiring a trainer or gym partner.

## What We Learned

- This is not just an AI problem; it is also a **safety**, **systems**, and **trust** problem.
- Real-time feedback only works if latency is low and responses are reliable.
- Scheduling is constrained by fatigue, time windows, and existing calendar events.
- Messaging / voice / auth APIs add real-world complexity that directly affects user confidence.

## How We Built It

### Stack
- **Frontend:** React
- **Backend:** Node.js, TypeScript, Express
- **Database:** Prisma + PostgreSQL (Supabase)
- **AI:** OpenAI (NLU + conversational logic)
- **Calendar:** Google Calendar API
- **RAG:** Actian VectorAI DB + OpenAI embeddings for health PDFs
- **Pose Tracking / AR-style guidance:** Python + MediaPipe + webcam
- **Notifications / voice:** Twilio + voice agent flows (with TTS)

### Product Flow
- Onboarding collects user preferences and constraints
- AI/voice agent helps users complete setup
- Pose tracker provides real-time form guidance and rep tracking
- Scheduler creates safe workout times and adapts when users skip/reschedule

## Challenges We Faced

1. **Form data + thresholds**
- Noisy pose landmarks and varied camera angles required careful tuning.

2. **Reliable coaching agent**
- SMS delivery/compliance friction pushed us toward voice onboarding for reliability and motivation.

3. **Real-time responsiveness**
- AR-style cues must be low-latency to feel correct and useful.

4. **Calendar safety**
- Scheduling had to enforce conflict checks and recovery spacing.

## What's Next

- Expand exercise coverage and form checks
- Integrate with real wearable / AR hardware
- Build a mobile companion for progress and plan management

## Takeaway

A healthy fitness habit is:
**safety x confidence x consistency**.
