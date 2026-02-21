import { Router } from "express";
import { getConsentUrl, exchangeCodeForTokens } from "../lib/googleAuth.js";
import { prisma } from "../lib/db.js";

export const oauthRouter = Router();

/**
 * GET /api/oauth/google?userId=xxx
 * Redirects the user to Google's consent screen.
 * After signup, redirect user here so they grant calendar access.
 */
oauthRouter.get("/google", (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "userId query param required" });
  }
  const url = getConsentUrl(userId);
  return res.redirect(url);
});

/**
 * GET /api/oauth/google/callback?code=...&state=userId
 * Google redirects here after consent. Exchange code for tokens and save them.
 */
oauthRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const userId = req.query.state as string | undefined;

  if (!code || !userId) {
    return res.status(400).json({ error: "Missing code or state" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? null,
      },
    });

    return res.send(`
      <html>
        <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5;">
          <div style="text-align: center; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
            <div style="width: 48px; height: 48px; margin: 0 auto 1rem; background: #22c55e; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700;">✓</div>
            <h2>Calendar connected!</h2>
            <p>GymBuddy can now schedule workouts on your Google Calendar.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.status(500).json({
      error: "Failed to exchange token",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
