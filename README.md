gymbuddy: hacklytics 2026 project.

## Setup

- **Backend:** Node 18+, PostgreSQL. Copy `.env.example` to `.env`, set `DATABASE_URL`, then:
  - `npm install` && `npx prisma generate`
  - `npx prisma migrate deploy` (or `prisma db push`) to apply schema
  - `npm run dev` — server on http://localhost:3001
- **Frontend:** `cd frontend && npm install && npm run dev` — app on http://localhost:5173 (proxies `/api` and `/webhooks` to backend).

## API

- `POST /api/signup` — body: `{ email, phoneNumber, heightCm, weightKg, goal, gymTravelMinutes }`. Creates user, generates plan, schedules next week, returns JSON.
- `POST /webhooks/sms` — Twilio incoming SMS (e.g. “can’t make it” → reschedule).
- `POST /api/schedule-next-week` — body: `{ userId }`. Re-runs scheduling for that user (for testing).
