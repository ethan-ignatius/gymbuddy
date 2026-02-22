import { Router } from "express";
import { prisma } from "../lib/db.js";

const router = Router();

/**
 * GET /api/live-session/workout-logs
 * Fetch recent workout logs from Supabase (via Prisma workout_logs).
 */
router.get("/workout-logs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const logs = await prisma.workoutLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(logs);
  } catch (err) {
    console.error("[live-session] workout-logs error:", err);
    res.status(500).json({ error: "Failed to fetch workout logs" });
  }
});

export { router as liveSessionRouter };
