import "dotenv/config";
import express from "express";
import { signupRouter } from "./routes/signup.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { scheduleRouter } from "./routes/schedule.js";
import { oauthRouter } from "./routes/oauth.js";
import { sendPreWorkoutNudges, sendPostWorkoutCheckins, sendSleepReminders } from "./lib/nudge.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/signup", signupRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api", scheduleRouter);
app.use("/webhooks", webhooksRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`GymBuddy server listening on http://localhost:${PORT}`);

  // Nudge timers (in production, use a proper job queue)
  setInterval(() => sendPreWorkoutNudges().catch(console.error), 15 * 60_000);   // every 15 min
  setInterval(() => sendPostWorkoutCheckins().catch(console.error), 30 * 60_000); // every 30 min
  setInterval(() => sendSleepReminders().catch(console.error), 60 * 60_000);      // every hour

  console.log("Nudge timers started.");
});
