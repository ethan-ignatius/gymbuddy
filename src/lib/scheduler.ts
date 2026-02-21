import type { User } from "@prisma/client";
import type { WorkoutPlan } from "../types/workout.js";
import * as calendar from "./calendar.js";
import type { BusySlot } from "./calendar.js";
import { saveScheduledWorkout } from "./db.js";
import { sendSms } from "./sms.js";

const WORKOUT_DURATION_MIN = 60;
const EARLIEST_HOUR = 6;
const LATEST_HOUR = 21;

function getNextMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

function slotsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Generate candidate 1-hour time slots for a given day,
 * filtering out ones that conflict with existing calendar events.
 */
function findFreeSlots(
  day: Date,
  busySlots: BusySlot[],
  travelMin: number
): { start: Date; end: Date }[] {
  const free: { start: Date; end: Date }[] = [];
  const totalMin = WORKOUT_DURATION_MIN + travelMin * 2; // travel there + back

  for (let hour = EARLIEST_HOUR; hour <= LATEST_HOUR - 1; hour++) {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + totalMin);

    const hasConflict = busySlots.some((busy) => slotsOverlap({ start, end }, busy));
    if (!hasConflict) {
      free.push({
        start,
        end: new Date(start.getTime() + WORKOUT_DURATION_MIN * 60_000),
      });
    }
  }
  return free;
}

/**
 * Pick the best slot from a day's free slots.
 * Prefers morning (9-11am), then afternoon (4-7pm), then whatever's left.
 */
function pickBestSlot(
  slots: { start: Date; end: Date }[]
): { start: Date; end: Date } | null {
  if (slots.length === 0) return null;

  const morning = slots.find((s) => s.start.getHours() >= 9 && s.start.getHours() <= 11);
  if (morning) return morning;

  const afternoon = slots.find((s) => s.start.getHours() >= 16 && s.start.getHours() <= 19);
  if (afternoon) return afternoon;

  return slots[0];
}

export async function scheduleWorkoutsForNextWeek(
  user: User,
  plan: WorkoutPlan
): Promise<{ scheduled: number }> {
  const weekStart = getNextMonday();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const busySlots = await calendar.listEvents(user, weekStart, weekEnd);
  const blocks = plan.blocks.slice(0, plan.daysPerWeek);
  const scheduledSlots: { start: Date; end: Date }[] = [];
  let scheduledCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Spread workouts across the week with rest days
    const intervalDays = Math.max(1, Math.floor(7 / plan.daysPerWeek));
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i * intervalDays);

    // Merge busy slots with already-scheduled gymbuddy slots to avoid self-conflicts
    const allBusy: BusySlot[] = [
      ...busySlots,
      ...scheduledSlots.map((s) => ({ start: s.start, end: s.end })),
    ];

    const freeSlots = findFreeSlots(day, allBusy, user.gymTravelMin);
    const chosen = pickBestSlot(freeSlots);

    if (!chosen) {
      console.log(`No free slot found for ${block.name} on ${day.toDateString()}`);
      continue;
    }

    const eventId = await calendar.createCalendarEvent(user, {
      start: chosen.start,
      end: chosen.end,
      title: `Gym – ${block.name}`,
      description: formatWorkoutDescription(block),
    });

    await saveScheduledWorkout({
      userId: user.id,
      workoutBlockName: block.name,
      startTime: chosen.start,
      endTime: chosen.end,
      calendarEventId: eventId ?? undefined,
      status: "scheduled",
    });

    scheduledSlots.push(chosen);
    scheduledCount++;
  }

  const dayList = scheduledSlots
    .map((s) => s.start.toLocaleDateString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }))
    .join(", ");

  await sendSms(
    user.phoneNumber,
    `Hey! Your GymBuddy plan is set — ${scheduledCount} workouts next week: ${dayList}. I'll text you before each one so you leave on time. Let's get it!`
  );

  return { scheduled: scheduledCount };
}

function formatWorkoutDescription(block: { name: string; exercises: { name: string; sets: number; reps: string }[] }): string {
  const lines = block.exercises.map(
    (e) => `• ${e.name}: ${e.sets}×${e.reps}`
  );
  return `${block.name}\n\n${lines.join("\n")}\n\nScheduled by GymBuddy`;
}

export async function rescheduleWorkout(
  user: User,
  workoutId: string,
  plan: WorkoutPlan
): Promise<{ newStart: Date; newEnd: Date } | null> {
  const { prisma } = await import("./db.js");
  const workout = await prisma.scheduledWorkout.findUnique({
    where: { id: workoutId },
  });
  if (!workout || workout.userId !== user.id) return null;

  // Cancel old calendar event
  if (workout.calendarEventId) {
    await calendar.deleteEvent(user, workout.calendarEventId);
  }

  // Look for a free slot in the next 3 days
  const now = new Date();
  const searchEnd = new Date(now);
  searchEnd.setDate(searchEnd.getDate() + 3);
  const busySlots = await calendar.listEvents(user, now, searchEnd);

  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);

    const freeSlots = findFreeSlots(day, busySlots, user.gymTravelMin);
    // Skip slots in the past
    const futureSlots = freeSlots.filter((s) => s.start > now);
    const chosen = pickBestSlot(futureSlots);

    if (chosen) {
      const newEventId = await calendar.createCalendarEvent(user, {
        start: chosen.start,
        end: chosen.end,
        title: `Gym – ${workout.workoutBlockName}`,
        description: "Rescheduled by GymBuddy",
      });

      await prisma.scheduledWorkout.update({
        where: { id: workoutId },
        data: {
          startTime: chosen.start,
          endTime: chosen.end,
          calendarEventId: newEventId,
          status: "rescheduled",
        },
      });

      return { newStart: chosen.start, newEnd: chosen.end };
    }
  }

  // No slot found — mark cancelled
  await prisma.scheduledWorkout.update({
    where: { id: workoutId },
    data: { status: "cancelled" },
  });
  return null;
}
