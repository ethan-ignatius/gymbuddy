import { prisma } from "./db.js";
import { sendSms } from "./sms.js";

const SLEEP_REMINDERS = [
  "Big day tomorrow! Get some quality sleep tonight — your body builds muscle while you rest.",
  "Tomorrow's workout is going to be great. Wind down, hydrate, and get to bed early.",
  "Reminder: sleep is a superpower. You've got a workout tomorrow — rest up!",
  "Your muscles grow while you sleep. Get a solid 7-8 hours tonight — tomorrow we work!",
];

const PRE_WORKOUT_NUDGES = [
  "Time to head to the gym! Your {workout} workout is coming up. Let's get after it!",
  "Gym time! {workout} is on the menu today. Grab your water and let's go!",
  "Hey! {workout} starts soon. Time to lace up and head out. You've got this!",
  "It's go time! {workout} is waiting for you. Remember: the hardest part is showing up.",
];

const POST_WORKOUT_CHECKINS = [
  "How'd {workout} go? Reply 'done' to log it, or 'skipped' if you missed it.",
  "Your {workout} session should be wrapping up — how'd it go? Reply 'done' or 'skipped'.",
];

const NUTRITION_TIPS = [
  "Quick tip: eat some protein within an hour of your workout tomorrow. Your muscles will thank you!",
  "Hydration check! Aim for at least 8 glasses of water today, especially with a workout coming up.",
  "Fuel up right today — lean protein, veggies, complex carbs. You've got a workout tomorrow!",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Check for workouts happening tomorrow and send sleep reminders.
 * Should be called around 9pm daily.
 */
export async function sendSleepReminders(): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const workouts = await prisma.scheduledWorkout.findMany({
    where: {
      status: "scheduled",
      startTime: { gte: tomorrow, lte: tomorrowEnd },
    },
    include: { user: true },
  });

  for (const workout of workouts) {
    const msg = pickRandom(SLEEP_REMINDERS) + `\n\nTomorrow: ${workout.workoutBlockName} at ${workout.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    await sendSms(workout.user.phoneNumber, msg);

    if (Math.random() < 0.5) {
      await sendSms(workout.user.phoneNumber, pickRandom(NUTRITION_TIPS));
    }
  }

  console.log(`Sent ${workouts.length} sleep reminders.`);
}

/**
 * Check for workouts starting soon and send pre-workout nudges.
 * Should be called every 15 minutes.
 */
export async function sendPreWorkoutNudges(): Promise<void> {
  const now = new Date();

  const workouts = await prisma.scheduledWorkout.findMany({
    where: {
      status: { in: ["scheduled", "rescheduled"] },
      reminderSent: false,
      startTime: {
        gte: now,
        lte: new Date(now.getTime() + 45 * 60_000), // within 45 min
      },
    },
    include: { user: true },
  });

  for (const workout of workouts) {
    const travelMin = workout.user.gymTravelMin;
    const minutesUntil = Math.round((workout.startTime.getTime() - now.getTime()) / 60_000);
    const leaveIn = Math.max(0, minutesUntil - travelMin);

    const msg = pickRandom(PRE_WORKOUT_NUDGES).replace("{workout}", workout.workoutBlockName);
    const timeMsg = leaveIn > 0
      ? `\n\nLeave in about ${leaveIn} minutes (${travelMin} min travel).`
      : `\n\nYou should head out now! (${travelMin} min travel time)`;

    await sendSms(workout.user.phoneNumber, msg + timeMsg);

    await prisma.scheduledWorkout.update({
      where: { id: workout.id },
      data: { reminderSent: true },
    });
  }

  console.log(`Sent ${workouts.length} pre-workout nudges.`);
}

/**
 * Check for workouts that recently ended and send post-workout check-ins.
 * Should be called every 30 minutes.
 */
export async function sendPostWorkoutCheckins(): Promise<void> {
  const now = new Date();
  const recentlyEnded = new Date(now.getTime() - 30 * 60_000);

  const workouts = await prisma.scheduledWorkout.findMany({
    where: {
      status: { in: ["scheduled", "rescheduled"] },
      reminderSent: true,
      endTime: { gte: recentlyEnded, lte: now },
    },
    include: { user: true },
  });

  for (const workout of workouts) {
    const msg = pickRandom(POST_WORKOUT_CHECKINS).replace("{workout}", workout.workoutBlockName);
    await sendSms(workout.user.phoneNumber, msg);
  }

  console.log(`Sent ${workouts.length} post-workout check-ins.`);
}
