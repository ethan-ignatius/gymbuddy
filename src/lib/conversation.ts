import type { User } from "@prisma/client";
import { prisma } from "./db.js";
import { generateWorkoutPlan } from "./workoutPlan.js";
import { scheduleWorkoutsForNextWeek } from "./scheduler.js";
import { sendSms } from "./sms.js";
import { getNextWorkoutForUser } from "./db.js";
import { rescheduleWorkout } from "./scheduler.js";

const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

function parseDays(text: string): string[] {
  const lower = text.toLowerCase();
  return DAY_NAMES.filter(
    (d) => lower.includes(d) || lower.includes(DAY_LABELS[d].toLowerCase())
  );
}

function parseNumber(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function parseTimePref(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("morning") || lower.includes("early") || lower.includes("am")) return "morning";
  if (lower.includes("afternoon") || lower.includes("lunch") || lower.includes("midday")) return "afternoon";
  if (lower.includes("evening") || lower.includes("night") || lower.includes("pm") || lower.includes("after work")) return "evening";
  return null;
}

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "fat loss",
  strength_and_size: "strength & size",
  strength_without_size: "pure strength",
};

const RESCHEDULE_PHRASES = [
  "can't make it", "cant make it", "reschedule", "skip",
  "move it", "different time", "not today", "busy",
];

/**
 * Main conversation handler. Routes incoming messages based on user's onboarding step.
 */
export async function handleConversation(user: User, message: string): Promise<void> {
  const body = message.trim();
  const lower = body.toLowerCase();

  // If onboarding is complete, handle ongoing conversation
  if (user.onboardingStep === "complete") {
    await handleOngoingConversation(user, lower);
    return;
  }

  // Onboarding flow
  switch (user.onboardingStep) {
    case "awaiting_days":
      await handleAwaitingDays(user, body);
      break;
    case "awaiting_time_pref":
      await handleAwaitingTimePref(user, body);
      break;
    case "awaiting_confirm":
      await handleAwaitingConfirm(user, body);
      break;
    default:
      await startOnboarding(user);
  }
}

/**
 * Send the first onboarding message after signup + Google Calendar connect.
 */
export async function startOnboarding(user: User): Promise<void> {
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: "awaiting_days" },
  });

  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;
  await sendSms(
    user.phoneNumber,
    `Hey! I'm your GymBuddy. Let's get you set up for ${goalLabel}.\n\nHow many days a week do you want to hit the gym? And which days work best?\n\n(e.g. "4 days — Mon, Tue, Thu, Sat")`
  );
}

async function handleAwaitingDays(user: User, body: string): Promise<void> {
  const days = parseDays(body);
  const count = parseNumber(body) ?? days.length;

  if (days.length === 0 && count === 0) {
    await sendSms(
      user.phoneNumber,
      `No worries — just tell me which days you'd like to train. For example: "Mon, Wed, Fri" or "4 days a week"`
    );
    return;
  }

  // If they gave a number but no specific days, ask for days
  if (days.length === 0 && count > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { daysPerWeek: count },
    });
    await sendSms(
      user.phoneNumber,
      `${count} days — solid! Which days work best for you? (e.g. "Mon, Wed, Fri, Sun")`
    );
    return;
  }

  const daysPerWeek = count > 0 ? count : days.length;
  const dayList = days.map((d) => DAY_LABELS[d]).join(", ");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      preferredDays: days.join(","),
      daysPerWeek,
      onboardingStep: "awaiting_time_pref",
    },
  });

  await sendSms(
    user.phoneNumber,
    `${dayList} — nice spread! What time do you prefer to work out?\n\n• Morning (6am–11am)\n• Afternoon (12pm–4pm)\n• Evening (5pm–9pm)`
  );
}

async function handleAwaitingTimePref(user: User, body: string): Promise<void> {
  const pref = parseTimePref(body);

  if (!pref) {
    await sendSms(
      user.phoneNumber,
      `Just say "morning", "afternoon", or "evening" and I'll find the best slots for you.`
    );
    return;
  }

  const prefLabel = pref.charAt(0).toUpperCase() + pref.slice(1);
  const days = (user.preferredDays ?? "").split(",").map((d) => DAY_LABELS[d] ?? d);
  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;
  const planType = user.goal === "lose_fat"
    ? "full-body split"
    : user.goal === "strength_without_size"
      ? "strength-focused program (5×5 style)"
      : "Upper/Lower split";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      preferredTime: pref,
      onboardingStep: "awaiting_confirm",
    },
  });

  await sendSms(
    user.phoneNumber,
    `Here's what I'm thinking:\n\n` +
    `Goal: ${goalLabel}\n` +
    `Days: ${days.join(", ")}\n` +
    `Time: ${prefLabel}\n` +
    `Program: ${planType}\n\n` +
    `I'll check your Google Calendar and avoid any conflicts. Sound good? (yes/no)`
  );
}

async function handleAwaitingConfirm(user: User, body: string): Promise<void> {
  const lower = body.toLowerCase();

  if (lower.includes("no") || lower.includes("change") || lower.includes("nah")) {
    await prisma.user.update({
      where: { id: user.id },
      data: { onboardingStep: "awaiting_days" },
    });
    await sendSms(
      user.phoneNumber,
      `No problem! Let's start over. How many days a week and which days work best for you?`
    );
    return;
  }

  if (!lower.includes("yes") && !lower.includes("yeah") && !lower.includes("sure") &&
      !lower.includes("yep") && !lower.includes("sounds good") && !lower.includes("let's go") &&
      !lower.includes("do it") && !lower.includes("go for it") && !lower.includes("ok") &&
      !lower.includes("good")) {
    await sendSms(
      user.phoneNumber,
      `Just reply "yes" to confirm or "no" to change things up.`
    );
    return;
  }

  // Confirmed! Schedule workouts
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: "complete" },
  });

  await sendSms(
    user.phoneNumber,
    `Let's go! Checking your calendar and setting up your workouts now...`
  );

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updatedUser) return;

  const plan = generateWorkoutPlan(updatedUser);
  const result = await scheduleWorkoutsForNextWeek(updatedUser, plan);

  if (result.scheduled === 0) {
    await sendSms(
      user.phoneNumber,
      `Hmm, I couldn't find free slots this week. I'll try again for next week. In the meantime, get some rest and eat well!`
    );
    return;
  }

  const slotSummary = result.details
    .map((d) => `• ${d.day} at ${d.time}: ${d.blockName}`)
    .join("\n");

  await sendSms(
    user.phoneNumber,
    `Done! Here's your schedule:\n\n${slotSummary}\n\n` +
    `I've added these to your Google Calendar. I'll text you:\n` +
    `- The night before (sleep reminder)\n` +
    `- Before each workout (time to go!)\n\n` +
    `Reply "can't make it" anytime to reschedule. Let's crush it!`
  );
}

async function handleOngoingConversation(user: User, lower: string): Promise<void> {
  // Reschedule
  const wantsReschedule = RESCHEDULE_PHRASES.some((p) => lower.includes(p));
  if (wantsReschedule) {
    const nextWorkout = await getNextWorkoutForUser(user.id);
    if (!nextWorkout) {
      await sendSms(user.phoneNumber, "You don't have any upcoming workouts to reschedule. Reply 'plan' and I'll set up next week.");
      return;
    }

    const plan = generateWorkoutPlan(user);
    const result = await rescheduleWorkout(user, nextWorkout.id, plan);
    if (result) {
      const when = result.newStart.toLocaleDateString("en-US", {
        weekday: "long", hour: "numeric", minute: "2-digit",
      });
      await sendSms(user.phoneNumber, `Got it — I moved your ${nextWorkout.workoutBlockName} to ${when}. I'll remind you when it's time. No stress!`);
    } else {
      await sendSms(user.phoneNumber, "I couldn't find a free slot in the next few days. I cancelled that one — we'll pick it up next week. Rest up!");
    }
    return;
  }

  // Mark workout done
  if (lower.includes("done") || lower.includes("finished") || lower.includes("crushed it") || lower.includes("completed")) {
    const nextWorkout = await getNextWorkoutForUser(user.id);
    if (nextWorkout) {
      await prisma.scheduledWorkout.update({
        where: { id: nextWorkout.id },
        data: { status: "completed" },
      });
      const motivations = [
        "That's what I'm talking about! Another one in the books.",
        "Crushed it! You're building something great, one workout at a time.",
        "Solid work today. Recovery starts now — hydrate and eat well!",
        "Workout logged! You showed up, that's what matters most.",
        "Beast mode! Rest up tonight, you earned it.",
      ];
      await sendSms(user.phoneNumber, motivations[Math.floor(Math.random() * motivations.length)]);
    } else {
      await sendSms(user.phoneNumber, "Nice! No workout on the books right now, but that hustle is noted.");
    }
    return;
  }

  // Skipped
  if (lower.includes("skipped") || lower.includes("missed")) {
    const nextWorkout = await getNextWorkoutForUser(user.id);
    if (nextWorkout) {
      await prisma.scheduledWorkout.update({
        where: { id: nextWorkout.id },
        data: { status: "skipped" },
      });
      await sendSms(user.phoneNumber, "No worries — everyone misses one sometimes. We'll get the next one. Want me to reschedule it? Reply 'reschedule' if so.");
    }
    return;
  }

  // Schedule next week
  if (lower.includes("plan") || lower.includes("schedule") || lower.includes("next week")) {
    const plan = generateWorkoutPlan(user);
    const result = await scheduleWorkoutsForNextWeek(user, plan);
    if (result.scheduled > 0) {
      const summary = result.details.map((d) => `• ${d.day} at ${d.time}: ${d.blockName}`).join("\n");
      await sendSms(user.phoneNumber, `Next week is set!\n\n${summary}\n\nAdded to your calendar. Let's keep the momentum going!`);
    } else {
      await sendSms(user.phoneNumber, "Your calendar is packed next week! Want to try different days or times? Just tell me.");
    }
    return;
  }

  // Default: be a buddy
  const replies = [
    "I'm here for you! Reply 'plan' to schedule next week, or 'can't make it' to move a workout.",
    "Remember: consistency beats perfection. You've got this!",
    "Need anything? I can reschedule workouts, plan next week, or just hype you up.",
    "Every rep, every set — it all adds up. Stay the course!",
    "Your body is a machine. Feed it well, rest it well, push it hard. That's the formula.",
  ];
  await sendSms(user.phoneNumber, replies[Math.floor(Math.random() * replies.length)]);
}
