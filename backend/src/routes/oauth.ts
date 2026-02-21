import { Router } from "express";
import { exchangeCodeForTokens, getConsentUrl } from "../lib/googleAuth.js";
import { prisma } from "../lib/db.js";
import { startOnboarding } from "../lib/conversation.js";

export const oauthRouter = Router();

oauthRouter.get("/google", (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "userId query param required" });
  }
  const url = getConsentUrl(userId);
  return res.redirect(url);
});

oauthRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const userId = req.query.state as string | undefined;

  if (!code || !userId) {
    return res.status(400).json({ error: "Missing code or state" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? null,
      },
    });

    await startOnboarding(user);

    return res.send(`
      <html>
        <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5;">
          <div style="text-align: center; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 420px;">
            <div style="width: 48px; height: 48px; margin: 0 auto 1rem; background: #22c55e; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700;">✓</div>
            <h2 style="margin: 0 0 0.5rem;">Calendar connected!</h2>
            <p style="color: #555;">Check your phone — GymBuddy just texted you. Reply to set up your workout schedule!</p>
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
