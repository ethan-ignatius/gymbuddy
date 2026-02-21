import twilio from "twilio";
import { getUserByPhone, getNextWorkoutForUser } from "./db.js";
import { rescheduleWorkout } from "./scheduler.js";
import { generateWorkoutPlan } from "./workoutPlan.js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendSms(to: string, body: string): Promise<void> {
  if (!client || !fromNumber) {
    console.log("[SMS stub]", { to, body });
    return;
  }
  await client.messages.create({ to, from: fromNumber, body });
}

export type IncomingSmsPayload = {
  From?: string;
  To?: string;
  Body?: string;
};

const RESCHEDULE_PHRASES = [
  "can't make it",
  "cant make it",
  "reschedule",
  "skip",
  "skip this",
  "move it",
  "different time",
  "cancel",
  "not today",
  "busy",
];

const MOTIVATION_REPLIES = [
  "You've got this! Remember why you started.",
  "Every rep counts. Let's crush it today!",
  "Discipline beats motivation. See you at the gym!",
  "The only workout you regret is the one you didn't do.",
  "Your future self will thank you. Get after it!",
];

export async function handleIncomingSms(
  payload: IncomingSmsPayload
): Promise<{ reply?: string }> {
  const from = payload.From;
  const body = (payload.Body ?? "").trim().toLowerCase();

  if (!from) return { reply: "" };

  const user = await getUserByPhone(from);
  if (!user) {
    await sendSms(from, "Hey! I don't recognize this number. Sign up at gymbuddy to get started.");
    return { reply: "Unknown user" };
  }

  // Check for reschedule intent
  const wantsReschedule = RESCHEDULE_PHRASES.some((p) => body.includes(p));

  if (wantsReschedule) {
    const nextWorkout = await getNextWorkoutForUser(user.id);
    if (!nextWorkout) {
      await sendSms(from, "You don't have any upcoming workouts to reschedule. Want me to plan next week? Reply 'plan'.");
      return { reply: "No upcoming workout" };
    }

    const plan = generateWorkoutPlan(user);
    const result = await rescheduleWorkout(user, nextWorkout.id, plan);

    if (result) {
      const when = result.newStart.toLocaleDateString("en-US", {
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
      });
      await sendSms(from, `Got it — I rescheduled your ${nextWorkout.workoutBlockName} to ${when}. I'll remind you when it's time to leave.`);
      return { reply: "Rescheduled" };
    } else {
      await sendSms(from, "I couldn't find a free slot in the next 3 days. I've cancelled that workout — we'll pick it up next week. Stay strong!");
      return { reply: "Cancelled — no slot" };
    }
  }

  // Check for "plan" / schedule request
  if (body.includes("plan") || body.includes("schedule") || body.includes("next week")) {
    await sendSms(from, "On it! I'll look at your calendar and schedule next week's workouts. Check your calendar in a few minutes.");
    // In production: trigger scheduleWorkoutsForNextWeek in background
    return { reply: "Schedule requested" };
  }

  // Default: motivational reply
  const motivation = MOTIVATION_REPLIES[Math.floor(Math.random() * MOTIVATION_REPLIES.length)];
  await sendSms(from, motivation);
  return { reply: "Motivation sent" };
}
