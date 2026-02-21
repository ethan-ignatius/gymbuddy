import { Router } from "express";
import { getUserByPhone, prisma } from "../lib/db.js";
import { handleConversation, startOnboarding } from "../lib/conversation.js";

export const chatRouter = Router();

/**
 * GET /api/chat/messages?phone=+1...
 * Returns conversation history for the web simulator.
 */
chatRouter.get("/messages", async (req, res) => {
  const phone = req.query.phone as string | undefined;
  if (!phone) return res.status(400).json({ error: "phone required" });

  const user = await getUserByPhone(phone);
  if (!user) return res.json({ messages: [], user: null });

  return res.json({
    messages: messageLog.get(user.id) ?? [],
    user: { id: user.id, email: user.email, goal: user.goal, onboardingStep: user.onboardingStep },
  });
});

/**
 * POST /api/chat/send
 * Simulates user sending an SMS. Same logic as /webhooks/sms.
 */
chatRouter.post("/send", async (req, res) => {
  const phone = req.body.phone as string | undefined;
  const body = req.body.message as string | undefined;

  if (!phone || !body) {
    return res.status(400).json({ error: "phone and message required" });
  }

  const user = await getUserByPhone(phone);
  if (!user) {
    return res.status(404).json({ error: "User not found. Sign up first." });
  }

  // Log the user message
  logMessage(user.id, "user", body);

  // Process through conversation engine
  await handleConversation(user, body);

  // Fetch updated user
  const updated = await prisma.user.findUnique({ where: { id: user.id } });

  return res.json({
    messages: messageLog.get(user.id) ?? [],
    user: updated ? { id: updated.id, email: updated.email, goal: updated.goal, onboardingStep: updated.onboardingStep } : null,
  });
});

/**
 * POST /api/chat/start-onboarding
 * Triggers the welcome message for a user.
 */
chatRouter.post("/start-onboarding", async (req, res) => {
  const phone = req.body.phone as string | undefined;
  if (!phone) return res.status(400).json({ error: "phone required" });

  const user = await getUserByPhone(phone);
  if (!user) return res.status(404).json({ error: "User not found" });

  await startOnboarding(user);

  return res.json({
    messages: messageLog.get(user.id) ?? [],
  });
});

// In-memory message log for the web simulator
const messageLog = new Map<string, { role: "user" | "bot"; text: string; time: string }[]>();

export function logMessage(userId: string, role: "user" | "bot", text: string) {
  if (!messageLog.has(userId)) {
    messageLog.set(userId, []);
  }
  messageLog.get(userId)!.push({
    role,
    text,
    time: new Date().toLocaleTimeString(),
  });
}
