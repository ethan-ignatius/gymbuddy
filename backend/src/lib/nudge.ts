import { prisma } from "./db.js";
import { sendSms } from "./sms.js";

const SLEEP_REMINDERS = [
  "Big day tomorrow! Get some quality sleep tonight.",
  "Tomorrow's workout is going to be great. Rest up!",
  "Sleep is a superpower. Get a solid 7-8 hours tonight!",
];

const PRE_WORKOUT_NUDGES = [
  "Time to head to the gym! {workout} is on the menu. Let's go!",
  "Gym time! {workout} starts soon. Grab your water and let's get after it!",
  "{workout} is coming up. Lace up and head out. You've got this!",
];

const POST_WORKOUT_CHECKINS = [
  "How'd {workout} go? Text me 'done' to log it!",
  "Your {workout} session should be wrapping up. How'd it go?",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function sendSleepReminders(): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const workouts = await prisma.scheduledWorkout.findMany({
    where: { status: "scheduled", startTime: { gte: tomorrow, lte: tomorrowEnd } },
    include: { user: true },
  });

  for (const workout of workouts) {
    const time = workout.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    await sendSms(workout.user.phoneNumber, `${pickRandom(SLEEP_REMINDERS)} Tomorrow: ${workout.workoutBlockName} at ${time}`);
  }
}

export async function sendPreWorkoutNudges(): Promise<void> {
  const now = new Date();

  const workouts = await prisma.scheduledWorkout.findMany({
    where: {
      status: { in: ["scheduled", "rescheduled"] },
      reminderSent: false,
      startTime: { gte: now, lte: new Date(now.getTime() + 45 * 60_000) },
    },
    include: { user: true },
  });

  for (const workout of workouts) {
    const minutesUntil = Math.round((workout.startTime.getTime() - now.getTime()) / 60_000);
    const leaveIn = Math.max(0, minutesUntil - workout.user.gymTravelMin);

    let msg = pickRandom(PRE_WORKOUT_NUDGES).replace("{workout}", workout.workoutBlockName);
    if (leaveIn > 0) msg += ` Leave in about ${leaveIn} min.`;
    else msg += ` Head out now!`;

    await sendSms(workout.user.phoneNumber, msg);
    await prisma.scheduledWorkout.update({ where: { id: workout.id }, data: { reminderSent: true } });
  }
}

export async function sendPostWorkoutCheckins(): Promise<void> {
  const now = new Date();

  const workouts = await prisma.scheduledWorkout.findMany({
    where: {
      status: { in: ["scheduled", "rescheduled"] },
      reminderSent: true,
      endTime: { gte: new Date(now.getTime() - 30 * 60_000), lte: now },
    },
    include: { user: true },
  });

  for (const workout of workouts) {
    await sendSms(workout.user.phoneNumber, pickRandom(POST_WORKOUT_CHECKINS).replace("{workout}", workout.workoutBlockName));
  }
}
