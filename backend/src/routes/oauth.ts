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

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
    return res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="3;url=${frontendUrl}/dashboard" />
        </head>
        <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a;">
          <div style="text-align: center; background: #141414; padding: 2.5rem; border-radius: 16px; box-shadow: 0 2px 24px rgba(0,0,0,0.4); max-width: 420px; border: 1px solid rgba(232,196,104,0.15);">
            <div style="width: 56px; height: 56px; margin: 0 auto 1.25rem; background: rgba(232,196,104,0.12); color: #e8c468; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; border: 1px solid rgba(232,196,104,0.3);">✓</div>
            <h2 style="margin: 0 0 0.5rem; color: #f0ede6; font-family: system-ui;">Calendar connected!</h2>
            <p style="color: #888; margin: 0 0 1.75rem; line-height: 1.6;">Check your phone — GymBuddy just texted you. Reply to set up your workout schedule!</p>
            <a href="${frontendUrl}/dashboard" style="display: inline-block; background: #e8c468; color: #0a0a0a; text-decoration: none; font-weight: 700; padding: 0.75rem 1.75rem; border-radius: 8px; font-size: 0.95rem;">Go to Dashboard →</a>
            <p style="color: #555; font-size: 0.8rem; margin: 1rem 0 0;">Redirecting automatically in 3 seconds…</p>
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
