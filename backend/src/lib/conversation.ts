import type { User } from "@prisma/client";
import { prisma } from "./db.js";
import { generateWorkoutPlan } from "./workoutPlan.js";
import { scheduleWorkoutsForNextWeek } from "./scheduler.js";
import { sendSms } from "./sms.js";
import { getAiResponse } from "./ai.js";

const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "fat loss",
  strength_and_size: "strength & size",
  strength_without_size: "pure strength",
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

const YES_PHRASES = [
  "yes", "yeah", "sure", "yep", "yup", "sounds good",
  "let's go", "lets go", "do it", "go for it", "ok",
  "okay", "good", "cool", "bet", "absolutely", "for sure",
  "perfect", "great", "confirmed", "confirm", "y",
];

const NO_PHRASES = ["no", "nah", "change", "nope", "redo", "restart", "different"];

function isAffirmative(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return YES_PHRASES.some((p) => lower === p || lower.includes(p));
}

function isNegative(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return NO_PHRASES.some((p) => lower === p || lower.includes(p));
}

export async function handleConversation(user: User, message: string): Promise<void> {
  const body = message.trim();

  if (user.onboardingStep === "complete") {
    await handleOngoingConversation(user, body);
    return;
  }

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

export async function startOnboarding(user: User): Promise<void> {
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: "awaiting_days" },
  });

  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;
  await sendSms(
    user.phoneNumber,
    `Hey! I'm GymBuddy. Let's set you up for ${goalLabel}. How many days a week do you want to train, and which days? (e.g. "4 days - Mon, Tue, Thu, Sat")`
  );
}

async function handleAwaitingDays(user: User, body: string): Promise<void> {
  const days = parseDays(body);
  const count = parseNumber(body) ?? days.length;

  if (days.length === 0 && count === 0) {
    await sendSms(user.phoneNumber, `Which days work for you? Like "Mon, Wed, Fri" or "4 days a week".`);
    return;
  }

  if (days.length === 0 && count > 0) {
    await prisma.user.update({ where: { id: user.id }, data: { daysPerWeek: count } });
    await sendSms(user.phoneNumber, `${count} days, solid! Which specific days?`);
    return;
  }

  const daysPerWeek = count > 0 ? count : days.length;
  const dayList = days.map((d) => DAY_LABELS[d]).join(", ");

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredDays: days.join(","), daysPerWeek, onboardingStep: "awaiting_time_pref" },
  });

  await sendSms(user.phoneNumber, `${dayList} - great! Morning, afternoon, or evening workouts?`);
}

async function handleAwaitingTimePref(user: User, body: string): Promise<void> {
  const pref = parseTimePref(body);

  if (!pref) {
    await sendSms(user.phoneNumber, `Just say "morning", "afternoon", or "evening".`);
    return;
  }

  const days = (user.preferredDays ?? "").split(",").map((d) => DAY_LABELS[d] ?? d);
  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredTime: pref, onboardingStep: "awaiting_confirm" },
  });

  await sendSms(
    user.phoneNumber,
    `Your plan: ${goalLabel}, ${days.join(", ")}, ${pref}s. I'll avoid calendar conflicts. Sound good?`
  );
}

async function handleAwaitingConfirm(user: User, body: string): Promise<void> {
  if (isNegative(body)) {
    await prisma.user.update({ where: { id: user.id }, data: { onboardingStep: "awaiting_days" } });
    await sendSms(user.phoneNumber, `No problem! How many days and which days work?`);
    return;
  }

  if (!isAffirmative(body)) {
    const aiReply = await getAiResponse(user, `The user was asked to confirm their workout plan and replied: "${body}". Is this a yes or no? Reply only YES or NO.`);
    if (aiReply && aiReply.toLowerCase().includes("no")) {
      await prisma.user.update({ where: { id: user.id }, data: { onboardingStep: "awaiting_days" } });
      await sendSms(user.phoneNumber, `No problem! How many days and which days work?`);
      return;
    }
  }

  await prisma.user.update({ where: { id: user.id }, data: { onboardingStep: "complete" } });
  await sendSms(user.phoneNumber, `Setting up your workouts now...`);

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updatedUser) return;

  const plan = generateWorkoutPlan(updatedUser);
  const result = await scheduleWorkoutsForNextWeek(updatedUser, plan);

  if (result.scheduled === 0) {
    await sendSms(user.phoneNumber, `Couldn't find free slots this week. Text me to try different days!`);
    return;
  }

  const slotSummary = result.details.map((d) => `${d.day} ${d.time}: ${d.blockName}`).join("\n");

  await sendSms(
    user.phoneNumber,
    `Done! Your schedule:\n${slotSummary}\nAdded to your Google Calendar. Text me anytime - "can't make it", "reschedule", or ask me anything!`
  );
}

/**
 * All ongoing messages go through AI with tool-calling.
 * The AI can schedule, reschedule, cancel, and complete workouts on Google Calendar.
 */
async function handleOngoingConversation(user: User, message: string): Promise<void> {
  const aiReply = await getAiResponse(user, message);
  if (aiReply) {
    await sendSms(user.phoneNumber, aiReply);
    return;
  }

  // Fallback only if OpenAI is not configured
  await sendSms(user.phoneNumber, "I'm here! Text me about your workouts anytime.");
}
