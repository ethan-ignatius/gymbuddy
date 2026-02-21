import { Router } from "express";
import { prisma } from "../lib/db.js";
import {
  onboardingGreeting,
  handleDaysResponse,
  handleTimeResponse,
  handleConfirmResponse,
  preWorkoutReminderTwiml,
} from "../lib/voice.js";

export const voiceRouter = Router();

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "fat loss",
  strength_and_size: "strength and size",
  strength_without_size: "pure strength",
};

voiceRouter.post("/onboard/greet", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).send("Missing userId");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).send("User not found");

  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;
  res.type("text/xml").send(onboardingGreeting(userId, goalLabel));
});

voiceRouter.post("/onboard/days", async (req, res) => {
  const userId = req.query.userId as string;
  const speechResult = req.body.SpeechResult ?? "";
  console.log(`[Voice] Days speech: "${speechResult}"`);

  const twiml = await handleDaysResponse(userId, speechResult);
  res.type("text/xml").send(twiml);
});

voiceRouter.post("/onboard/time", async (req, res) => {
  const userId = req.query.userId as string;
  const speechResult = req.body.SpeechResult ?? "";
  console.log(`[Voice] Time speech: "${speechResult}"`);

  const twiml = await handleTimeResponse(userId, speechResult);
  res.type("text/xml").send(twiml);
});

voiceRouter.post("/onboard/confirm", async (req, res) => {
  const userId = req.query.userId as string;
  const speechResult = req.body.SpeechResult ?? "";
  console.log(`[Voice] Confirm speech: "${speechResult}"`);

  const twiml = await handleConfirmResponse(userId, speechResult);
  res.type("text/xml").send(twiml);
});

voiceRouter.post("/reminder", async (req, res) => {
  const workoutName = req.query.workoutName as string ?? "workout";
  const minutesUntil = parseInt(req.query.minutesUntil as string ?? "30");
  const travelMin = parseInt(req.query.travelMin as string ?? "15");

  res.type("text/xml").send(preWorkoutReminderTwiml(workoutName, minutesUntil, travelMin));
});

voiceRouter.post("/status", (req, res) => {
  console.log(`[Voice] Call status: ${req.body.CallStatus} (${req.body.CallSid})`);
  res.sendStatus(200);
});
