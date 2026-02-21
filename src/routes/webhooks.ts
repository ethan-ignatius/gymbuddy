import { Router } from "express";
import { handleIncomingSms } from "../lib/sms.js";

export const webhooksRouter = Router();

webhooksRouter.post("/sms", async (req, res) => {
  try {
    const result = await handleIncomingSms(req.body);
    res.status(200).contentType("text/plain").send(result?.reply ?? "");
  } catch (err) {
    console.error("SMS webhook error:", err);
    res.status(500).send("Error processing message");
  }
});
