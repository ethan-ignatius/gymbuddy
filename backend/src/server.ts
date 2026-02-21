import "dotenv/config";
import express from "express";
import { signupRouter } from "./routes/signup.js";
import { scheduleRouter } from "./routes/schedule.js";
import { oauthRouter } from "./routes/oauth.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { chatRouter } from "./routes/chat.js";
import { voiceRouter } from "./routes/voice.js";
import { sendPreWorkoutNudges, sendPostWorkoutCheckins, sendSleepReminders } from "./lib/nudge.js";
import { startInboundSmsListener } from "./lib/inboundSms.js";
import { setBaseUrl } from "./lib/voice.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/signup", signupRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api", scheduleRouter);
app.use("/api/chat", chatRouter);
app.use("/webhooks", webhooksRouter);
app.use("/webhooks/voice", voiceRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`GymBuddy server listening on http://localhost:${PORT}`);
  setBaseUrl(process.env.BASE_URL ?? `http://localhost:${PORT}`);

  startInboundSmsListener();

  setInterval(() => sendPreWorkoutNudges().catch(console.error), 15 * 60_000);
  setInterval(() => sendPostWorkoutCheckins().catch(console.error), 30 * 60_000);
  setInterval(() => sendSleepReminders().catch(console.error), 60 * 60_000);
});
