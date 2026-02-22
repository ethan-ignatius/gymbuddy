import { Router } from "express";
import { signupBodySchema } from "../validation/signup.js";
import { createUser } from "../lib/db.js";
import { getConsentUrl } from "../lib/googleAuth.js";
import { startVoiceOnboarding } from "../lib/voice.js";

export const signupRouter = Router();

signupRouter.post("/", async (req, res) => {
  console.log("[Signup] body:", JSON.stringify(req.body));
  const parsed = signupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    console.log("[Signup] validation errors:", JSON.stringify(flat.fieldErrors));
    const fieldMessages = Object.entries(flat.fieldErrors)
      .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
      .join("; ");
    return res.status(400).json({
      error: "Validation failed",
      message: fieldMessages || "Invalid input",
      details: flat,
    });
  }

  try {
    const user = await createUser(parsed.data);
    const calendarAuthUrl = getConsentUrl(user.id);

    // Trigger voice onboarding immediately after signup without blocking response.
    startVoiceOnboarding(user).catch((err) => {
      console.error("[Signup] voice onboarding failed:", err);
    });

    return res.status(201).json({
      success: true,
      message: "Account created! You should receive a call shortly to set your workout days and time preference.",
      user: { id: user.id, email: user.email, goal: user.goal },
      calendarAuthUrl,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({
      error: "Signup failed",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
