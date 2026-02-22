import { Router } from "express";
import { getUserById, prisma } from "../lib/db.js";
import { generateWorkoutPlan } from "../lib/workoutPlan.js";
import { scheduleWorkoutsForNextWeek } from "../lib/scheduler.js";

export const scheduleRouter = Router();

scheduleRouter.get("/dashboard-data", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const email = req.query.email as string | undefined;

  if (!userId && !email) {
    return res.status(400).json({ error: "userId or email query param required" });
  }

  try {
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const plan = generateWorkoutPlan(user);

    const workouts = await prisma.scheduledWorkout.findMany({
      where: { userId: user.id },
      orderBy: { startTime: "desc" },
      take: 200,
    });

    const upcoming = workouts
      .filter((w) => ["scheduled", "rescheduled"].includes(w.status) && w.startTime >= now)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, 8)
      .map((w) => ({
        id: w.id,
        name: w.workoutBlockName,
        day: w.startTime.toLocaleDateString("en-US", { weekday: "short" }),
        date: w.startTime.toISOString(),
        time: w.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        status: w.status,
      }));

    const past = workouts
      .filter((w) => w.startTime < now)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    const history = past.slice(0, 12).map((w) => ({
      id: w.id,
      date: w.startTime.toISOString(),
      blockName: w.workoutBlockName,
      durationMin: Math.max(1, Math.round((w.endTime.getTime() - w.startTime.getTime()) / 60000)),
      status: w.status,
      formAvg: 0,
      prs: 0,
      notes: null,
      exercises: [],
    }));

    const last28: number[] = [];
    for (let i = 27; i >= 0; i--) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const hadWorkout = workouts.some(
        (w) =>
          w.startTime >= day &&
          w.startTime < nextDay &&
          ["completed", "scheduled", "rescheduled"].includes(w.status)
      );
      last28.push(hadWorkout ? 1 : 0);
    }

    const todayIndex = new Date().getDay() % Math.max(plan.blocks.length, 1);
    const todayBlock = plan.blocks[todayIndex] ?? plan.blocks[0] ?? null;
    const todayWorkout = todayBlock
      ? {
          name: todayBlock.name,
          day: "Today",
          focus: todayBlock.focus,
          exercises: todayBlock.exercises.map((e) => ({
            name: e.name,
            sets: e.sets,
            reps: e.reps,
          })),
        }
      : null;

    const recentPRs: { exercise: string; weight: number | null; date: string }[] = [];

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        goal: user.goal,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        gymTravelMin: user.gymTravelMin,
        preferredDays: user.preferredDays,
        preferredTime: user.preferredTime,
        onboardingStep: user.onboardingStep,
      },
      plan: {
        daysPerWeek: plan.daysPerWeek,
        blocks: plan.blocks,
      },
      todayWorkout,
      upcoming,
      history,
      attendance: { last28 },
      recentPRs,
    });
  } catch (err) {
    console.error("Dashboard data error:", err);
    return res.status(500).json({
      error: "Failed to load dashboard data",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

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
