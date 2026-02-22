import type { User } from "@prisma/client";
import type { WorkoutPlan } from "../types/workout.js";
import * as calendar from "./calendar.js";
import type { BusySlot } from "./calendar.js";
import { saveScheduledWorkout, prisma } from "./db.js";
import { sendSms } from "./sms.js";

const WORKOUT_DURATION_MIN = 60;

const TIME_RANGES: Record<string, { earliest: number; latest: number }> = {
  morning:   { earliest: 6, latest: 11 },
  afternoon: { earliest: 12, latest: 16 },
  evening:   { earliest: 17, latest: 21 },
};

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export type ScheduleResult = {
  scheduled: number;
  details: { day: string; time: string; blockName: string }[];
};

function slotsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Find free slots on a given day, accounting for travel time and existing events.
 * Never overlaps with anything on the calendar.
 */
function findFreeSlots(
  day: Date,
  busySlots: BusySlot[],
  travelMin: number,
  timePref: string
): { start: Date; end: Date }[] {
  const range = TIME_RANGES[timePref] ?? TIME_RANGES.morning;
  const free: { start: Date; end: Date }[] = [];
  const buffer = travelMin * 2; // travel to gym + back

  for (let hour = range.earliest; hour <= range.latest; hour++) {
    for (const minuteOffset of [0, 30]) {
      const start = new Date(day);
      start.setHours(hour, minuteOffset, 0, 0);

      // The block we're "claiming" includes travel buffer
      const blockStart = new Date(start.getTime() - travelMin * 60_000);
      const blockEnd = new Date(start.getTime() + (WORKOUT_DURATION_MIN + travelMin) * 60_000);

      const hasConflict = busySlots.some((busy) =>
        slotsOverlap({ start: blockStart, end: blockEnd }, busy)
      );

      if (!hasConflict) {
        free.push({
          start,
          end: new Date(start.getTime() + WORKOUT_DURATION_MIN * 60_000),
        });
      }
    }
  }
  return free;
}

function getNextWeekDates(preferredDays: string[]): Date[] {
  const now = new Date();
  const today = now.getDay();
  const dates: Date[] = [];

  for (const dayName of preferredDays) {
    const targetDay = DAY_MAP[dayName];
    if (targetDay === undefined) continue;

    let daysAhead = targetDay - today;
    if (daysAhead <= 0) daysAhead += 7; // always next occurrence

    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

export async function scheduleWorkoutsForNextWeek(
  user: User,
  plan: WorkoutPlan
): Promise<ScheduleResult> {
  const preferredDays = user.preferredDays
    ? user.preferredDays.split(",").map((d) => d.trim())
    : ["mon", "wed", "fri", "sat"].slice(0, plan.daysPerWeek);

  const timePref = user.preferredTime ?? "morning";
  const targetDates = getNextWeekDates(preferredDays);

  // Fetch ALL calendar events for the date range
  const rangeStart = targetDates[0] ?? new Date();
  const rangeEnd = new Date(targetDates[targetDates.length - 1] ?? new Date());
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const busySlots = await calendar.listEvents(user, rangeStart, rangeEnd);

  const blocks = plan.blocks.slice(0, plan.daysPerWeek);
  const scheduledSlots: BusySlot[] = [];
  const details: ScheduleResult["details"] = [];
  let scheduledCount = 0;

  for (let i = 0; i < Math.min(blocks.length, targetDates.length); i++) {
    const block = blocks[i];
    const day = targetDates[i];

    // Combine real calendar busy + already-scheduled gymbuddy slots
    const allBusy: BusySlot[] = [...busySlots, ...scheduledSlots];
    const freeSlots = findFreeSlots(day, allBusy, user.gymTravelMin, timePref);

    if (freeSlots.length === 0) {
      console.log(`No free ${timePref} slot on ${day.toDateString()} for ${block.name}`);
      continue;
    }

    const chosen = freeSlots[0]; // first available in preferred range

    const eventId = await calendar.createCalendarEvent(user, {
      start: chosen.start,
      end: chosen.end,
      title: `Gym – ${block.name}`,
      description: block.exercises
        .map((e) => `• ${e.name}: ${e.sets}×${e.reps}`)
        .join("\n") + "\n\nScheduled by GymBuddy",
    });

    await saveScheduledWorkout({
      userId: user.id,
      workoutBlockName: block.name,
      startTime: chosen.start,
      endTime: chosen.end,
      calendarEventId: eventId ?? undefined,
      status: "scheduled",
    });

    scheduledSlots.push({ start: chosen.start, end: chosen.end });
    details.push({
      day: day.toLocaleDateString("en-US", { weekday: "long" }),
      time: chosen.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      blockName: block.name,
    });
    scheduledCount++;
  }

  return { scheduled: scheduledCount, details };
}

export async function rescheduleWorkout(
  user: User,
  workoutId: string,
  plan: WorkoutPlan
): Promise<{ newStart: Date; newEnd: Date } | null> {
  const workout = await prisma.scheduledWorkout.findUnique({
    where: { id: workoutId },
  });
  if (!workout || workout.userId !== user.id) return null;

  if (workout.calendarEventId) {
    await calendar.deleteEvent(user, workout.calendarEventId);
  }

  const timePref = user.preferredTime ?? "morning";
  const now = new Date();
  const searchEnd = new Date(now);
  searchEnd.setDate(searchEnd.getDate() + 5);
  const busySlots = await calendar.listEvents(user, now, searchEnd);

  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);

    const freeSlots = findFreeSlots(day, busySlots, user.gymTravelMin, timePref);
    const futureSlots = freeSlots.filter((s) => s.start > now);

    if (futureSlots.length > 0) {
      const chosen = futureSlots[0];

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

  await prisma.scheduledWorkout.update({
    where: { id: workoutId },
    data: { status: "cancelled" },
  });
  return null;
}
