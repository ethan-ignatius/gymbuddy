import twilio from "twilio";
import OpenAI from "openai";
import { prisma } from "./db.js";
import { generateWorkoutPlan } from "./workoutPlan.js";
import { scheduleWorkoutsForNextWeek } from "./scheduler.js";
import type { User } from "@prisma/client";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER!;

const client = TWILIO_SID && TWILIO_TOKEN ? twilio(TWILIO_SID, TWILIO_TOKEN) : null;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const ONBOARDING_CALL_COOLDOWN_MS = 2 * 60_000;
const recentOnboardingCallAt = new Map<string, number>();
const activeOnboardingCallBySid = new Map<string, string>();

let BASE_URL = process.env.BASE_URL ?? "";

export function setBaseUrl(url: string) {
  BASE_URL = url;
  console.log(`[Voice] Base URL set to ${BASE_URL}`);
}

export function getBaseUrl(): string {
  return BASE_URL;
}

const VoiceResponse = twilio.twiml.VoiceResponse;

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "fat loss",
  strength_and_size: "strength and size",
  strength_without_size: "pure strength",
};

const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/**
 * Initiate an outbound call to a user.
 */
export async function callUser(
  phoneNumber: string,
  webhookPath: string
): Promise<string | null> {
  if (!client) {
    console.log(`[Voice stub] Would call ${phoneNumber} → ${webhookPath}`);
    return null;
  }

  const call = await client.calls.create({
    to: phoneNumber,
    from: TWILIO_PHONE,
    url: `${BASE_URL}${webhookPath}`,
    statusCallback: `${BASE_URL}/webhooks/voice/status`,
    statusCallbackEvent: ["completed"],
  });

  console.log(`[Voice] Calling ${phoneNumber} — SID: ${call.sid}`);
  return call.sid;
}

export function recordVoiceCallStatus(callSid?: string, callStatus?: string): void {
  if (!callSid || !callStatus) return;
  const terminal = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);
  if (terminal.has(callStatus)) {
    activeOnboardingCallBySid.delete(callSid);
  }
}

/**
 * Generate TwiML for the onboarding greeting.
 */
export function onboardingGreeting(userId: string, goalLabel: string): string {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: "Polly.Matthew" },
    `Hey! I'm your Gym Buddy. I see you're going for ${goalLabel}. Let's set up your workout schedule.`
  );
  const gather = twiml.gather({
    input: ["speech"],
    action: `${BASE_URL}/webhooks/voice/onboard/days?userId=${userId}`,
    speechTimeout: "auto",
    timeout: 6,
    language: "en-US",
  });
  gather.say(
    { voice: "Polly.Matthew" },
    `How many days a week do you want to hit the gym, and which days work best?`
  );
  twiml.say({ voice: "Polly.Matthew" }, "I didn't catch that. Let me call you back.");
  return twiml.toString();
}

/**
 * Handle the days response from speech.
 */
export async function handleDaysResponse(userId: string, speechResult: string): Promise<string> {
  const twiml = new VoiceResponse();
  const lower = speechResult.toLowerCase();

  const dayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const dayFull: Record<string, string[]> = {
    mon: ["monday", "mon"], tue: ["tuesday", "tue"], wed: ["wednesday", "wed"],
    thu: ["thursday", "thu"], fri: ["friday", "fri"], sat: ["saturday", "sat"], sun: ["sunday", "sun"],
  };

  const parsedDays = dayNames.filter((d) => dayFull[d].some((w) => lower.includes(w)));
  const numMatch = lower.match(/(\d+)/);
  let count = numMatch ? parseInt(numMatch[1]) : parsedDays.length;
  let aiDays = parsedDays;

  if (parsedDays.length === 0 && !count) {
    const parsed = await parseDaysWithAi(speechResult);
    if (parsed) {
      aiDays = parsed.days.length > 0 ? parsed.days : aiDays;
      count = parsed.count ?? count;
    }
  }

  if (aiDays.length === 0 && count === 0) {
    const gather = twiml.gather({
      input: ["speech"],
      action: `${BASE_URL}/webhooks/voice/onboard/days?userId=${userId}`,
      speechTimeout: "auto",
      timeout: 6,
    });
    gather.say({ voice: "Polly.Matthew" }, "I didn't quite get that. Which days do you want to work out? For example, Monday, Wednesday, and Friday.");
    return twiml.toString();
  }

  if (aiDays.length === 0 && count > 0) {
    await prisma.user.update({ where: { id: userId }, data: { daysPerWeek: count } });
    const gather = twiml.gather({
      input: ["speech"],
      action: `${BASE_URL}/webhooks/voice/onboard/days?userId=${userId}`,
      speechTimeout: "auto",
      timeout: 6,
    });
    gather.say({ voice: "Polly.Matthew" }, `${count} days, solid! Which specific days work for you?`);
    return twiml.toString();
  }

  const daysPerWeek = count > 0 ? count : aiDays.length;
  const dayList = aiDays.map((d) => DAY_LABELS[d]).join(", ");

  await prisma.user.update({
    where: { id: userId },
    data: { preferredDays: aiDays.join(","), daysPerWeek },
  });

  const gather = twiml.gather({
    input: ["speech"],
    action: `${BASE_URL}/webhooks/voice/onboard/time?userId=${userId}`,
    speechTimeout: "auto",
    timeout: 6,
  });
  gather.say({ voice: "Polly.Matthew" }, `${dayList}, great choices! Do you prefer working out in the morning, afternoon, or evening?`);
  return twiml.toString();
}

/**
 * Handle the time preference response.
 */
export async function handleTimeResponse(userId: string, speechResult: string): Promise<string> {
  const twiml = new VoiceResponse();
  const lower = speechResult.toLowerCase();

  let pref: string | null = null;
  if (lower.includes("morning") || lower.includes("early") || lower.includes("a.m")) pref = "morning";
  else if (lower.includes("afternoon") || lower.includes("lunch") || lower.includes("midday")) pref = "afternoon";
  else if (lower.includes("evening") || lower.includes("night") || lower.includes("p.m") || lower.includes("after work")) pref = "evening";
  if (!pref) pref = await parseTimePrefWithAi(speechResult);

  if (!pref) {
    const gather = twiml.gather({
      input: ["speech"],
      action: `${BASE_URL}/webhooks/voice/onboard/time?userId=${userId}`,
      speechTimeout: "auto",
      timeout: 6,
    });
    gather.say({ voice: "Polly.Matthew" }, "Would you prefer morning, afternoon, or evening workouts?");
    return twiml.toString();
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { preferredTime: pref },
  });

  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;
  const days = (user.preferredDays ?? "").split(",").map((d) => DAY_LABELS[d] ?? d).join(", ");

  const gather = twiml.gather({
    input: ["speech"],
    action: `${BASE_URL}/webhooks/voice/onboard/confirm?userId=${userId}`,
    speechTimeout: "auto",
    timeout: 6,
  });
  gather.say(
    { voice: "Polly.Matthew" },
    `Here's what I'm thinking. Goal: ${goalLabel}. Days: ${days}. Time: ${pref}. ` +
    `I'll check your Google Calendar and avoid any conflicts. Does that sound good?`
  );
  return twiml.toString();
}

/**
 * Handle the confirmation response.
 */
export async function handleConfirmResponse(userId: string, speechResult: string): Promise<string> {
  const twiml = new VoiceResponse();
  const lower = speechResult.toLowerCase();

  const noWords = ["no", "nah", "change", "nope", "different", "restart"];
  if (noWords.some((w) => lower.includes(w))) {
    await prisma.user.update({ where: { id: userId }, data: { onboardingStep: "awaiting_days" } });
    const gather = twiml.gather({
      input: ["speech"],
      action: `${BASE_URL}/webhooks/voice/onboard/days?userId=${userId}`,
      speechTimeout: "auto",
      timeout: 6,
    });
    gather.say({ voice: "Polly.Matthew" }, "No problem! Let's start over. How many days a week and which days work for you?");
    return twiml.toString();
  }

  // Treat as yes
  twiml.say({ voice: "Polly.Matthew" }, "Awesome! I'm setting up your workouts now. I'll add them to your Google Calendar and text you before each one. Talk to you soon!");
  twiml.hangup();

  // Schedule workouts async
  scheduleAfterConfirm(userId).catch(console.error);

  return twiml.toString();
}

async function scheduleAfterConfirm(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingStep: "complete" },
  });

  const plan = generateWorkoutPlan(user);
  const result = await scheduleWorkoutsForNextWeek(user, plan);

  const { sendSms } = await import("./sms.js");

  if (result.scheduled === 0) {
    await sendSms(user.phoneNumber, "Couldn't find free slots this week. I'll get next week sorted. Text me anytime!");
    return;
  }

  const slotSummary = result.details
    .map((d) => `${d.day} ${d.time}: ${d.blockName}`)
    .join("\n");

  await sendSms(
    user.phoneNumber,
    `Your schedule is set!\n${slotSummary}\nAdded to your calendar. I'll call you before each workout. Text me to reschedule or cancel anytime!`
  );
}

/**
 * Generate TwiML for a pre-workout reminder call.
 */
export function preWorkoutReminderTwiml(workoutName: string, minutesUntil: number, travelMin: number): string {
  const twiml = new VoiceResponse();
  const leaveIn = Math.max(0, minutesUntil - travelMin);

  let message: string;
  if (leaveIn > 0) {
    message = `Hey! Your ${workoutName} workout is in about ${minutesUntil} minutes. ` +
      `With ${travelMin} minutes of travel time, you should leave in about ${leaveIn} minutes. ` +
      `Let's crush it today! Have a great workout.`;
  } else {
    message = `Hey! Your ${workoutName} workout is starting soon. ` +
      `You should head to the gym now! Let's go, you've got this!`;
  }

  twiml.say({ voice: "Polly.Matthew" }, message);
  twiml.hangup();
  return twiml.toString();
}

/**
 * Call user to start onboarding.
 */
export async function startVoiceOnboarding(user: User): Promise<void> {
  const lastCall = recentOnboardingCallAt.get(user.id) ?? 0;
  if (Date.now() - lastCall < ONBOARDING_CALL_COOLDOWN_MS) {
    console.log(`[Voice] Skipping duplicate onboarding call for ${user.phoneNumber}`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: "voice_onboarding" },
  });

  const callSid = await callUser(user.phoneNumber, `/webhooks/voice/onboard/greet?userId=${user.id}`);
  recentOnboardingCallAt.set(user.id, Date.now());
  if (callSid) {
    activeOnboardingCallBySid.set(callSid, user.id);
  }
}

async function parseDaysWithAi(
  speechResult: string
): Promise<{ days: string[]; count: number | null } | null> {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract workout days and count from the user text. " +
            "Return strict JSON only: {\"days\":[\"mon\",\"tue\",...],\"count\":number|null}. " +
            "Use days only from mon,tue,wed,thu,fri,sat,sun.",
        },
        { role: "user", content: speechResult },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { days?: string[]; count?: number | null };
    const valid = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    const days = (parsed.days ?? []).filter((d) => valid.has(d));
    const count = typeof parsed.count === "number" ? parsed.count : null;
    return { days, count };
  } catch (err) {
    console.log("[Voice] parseDaysWithAi failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function parseTimePrefWithAi(speechResult: string): Promise<"morning" | "afternoon" | "evening" | null> {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Classify the text into one label: morning, afternoon, evening, or unknown. " +
            "Return only one word.",
        },
        { role: "user", content: speechResult },
      ],
    });
    const out = (response.choices[0]?.message?.content ?? "").trim().toLowerCase();
    if (out === "morning" || out === "afternoon" || out === "evening") return out;
    return null;
  } catch (err) {
    console.log("[Voice] parseTimePrefWithAi failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
