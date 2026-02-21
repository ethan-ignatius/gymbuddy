import { Router } from "express";
import { getUserByPhone } from "../lib/db.js";
import { handleConversation, startOnboarding } from "../lib/conversation.js";
import { sendSms } from "../lib/sms.js";

export const webhooksRouter = Router();

webhooksRouter.post("/sms", async (req, res) => {
  try {
    const from = req.body.From as string | undefined;
    const body = (req.body.Body ?? "").trim();

    if (!from) {
      return res.status(400).send("Missing From");
    }

    const user = await getUserByPhone(from);
    if (!user) {
      await sendSms(from, "Hey! I don't recognize this number. Sign up at gymbuddy to get started.");
      return res.status(200).send("");
    }

    await handleConversation(user, body);
    return res.status(200).send("");
  } catch (err) {
    console.error("SMS webhook error:", err);
    return res.status(500).send("Error");
  }
});
