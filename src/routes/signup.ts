import { Router } from "express";
import { signupBodySchema } from "../validation/signup.js";
import { createUser } from "../lib/db.js";
import { getConsentUrl } from "../lib/googleAuth.js";

export const signupRouter = Router();

signupRouter.post("/", async (req, res) => {
  const parsed = signupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten(),
    });
  }

  try {
    const user = await createUser(parsed.data);
    const calendarAuthUrl = getConsentUrl(user.id);

    return res.status(201).json({
      success: true,
      message: "Account created! Connect your Google Calendar and I'll text you to set up your workout schedule.",
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
