import { Router } from "express";
import { getUserById } from "../lib/db.js";
import { generateWorkoutPlan } from "../lib/workoutPlan.js";
import { scheduleWorkoutsForNextWeek } from "../lib/scheduler.js";

export const scheduleRouter = Router();

scheduleRouter.post("/schedule-next-week", async (req, res) => {
  const userId = req.body?.userId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "userId required in body" });
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const plan = generateWorkoutPlan(user);
    await scheduleWorkoutsForNextWeek(user, plan);

    return res.json({
      success: true,
      message: "Scheduled next week's workouts",
    });
  } catch (err) {
    console.error("Schedule error:", err);
    return res.status(500).json({
      error: "Scheduling failed",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
