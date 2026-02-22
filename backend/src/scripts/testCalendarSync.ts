/**
 * Test script for calendar sync.
 * Creates mock scheduled workouts with no calendar events, then runs sync.
 *
 * Run: npx tsx src/scripts/testCalendarSync.ts [userId?]
 */

import "dotenv/config";
import { prisma } from "../lib/db.js";
import { saveScheduledWorkout } from "../lib/db.js";
import { syncCalendarEventsForUser } from "../lib/scheduler.js";
import { GoogleCalendarAuthError } from "../lib/calendar.js";
import { getConsentUrl } from "../lib/googleAuth.js";

async function main() {
  const userIdArg = process.argv[2];
  const user = userIdArg
    ? await prisma.user.findUnique({ where: { id: userIdArg } })
    : await prisma.user.findFirst();

  if (!user) {
    console.log("No user found. Sign up first or pass userId: npx tsx src/scripts/testCalendarSync.ts <userId>");
    return;
  }

  console.log(`User: ${user.email} (${user.id})`);
  console.log(`Google token: ${user.googleAccessToken ? "YES" : "NO"}\n`);

  // Create mock workouts: future dates, no calendarEventId (simulates phone-call-before-connect scenario)
  const now = new Date();
  const mockWorkouts = [
    { name: "Push Day", daysFromNow: 1, hour: 9 },
    { name: "Pull Day", daysFromNow: 3, hour: 10 },
    { name: "Leg Day", daysFromNow: 5, hour: 8 },
  ];

  console.log("Creating mock workouts (no calendar events)...");
  for (const m of mockWorkouts) {
    const start = new Date(now);
    start.setDate(start.getDate() + m.daysFromNow);
    start.setHours(m.hour, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);

    await saveScheduledWorkout({
      userId: user.id,
      workoutBlockName: m.name,
      startTime: start,
      endTime: end,
      calendarEventId: undefined, // explicitly no event
      status: "scheduled",
    });
    console.log(`  ${m.name}: ${start.toLocaleString()} (calendarEventId: null)`);
  }

  const before = await prisma.scheduledWorkout.findMany({
    where: { userId: user.id, status: "scheduled", startTime: { gte: now } },
    orderBy: { startTime: "asc" },
  });
  const unsyncedBefore = before.filter((w) => !w.calendarEventId).length;
  console.log(`\nBefore sync: ${unsyncedBefore} workout(s) missing calendar events\n`);

  let synced: number;
  try {
    synced = await syncCalendarEventsForUser(user);
  } catch (err) {
    if (err instanceof GoogleCalendarAuthError) {
      console.error("\nGoogle Calendar connection expired (unauthorized_client).");
      console.error("Fix: Reconnect by visiting this URL in your browser:");
      console.error(`  ${getConsentUrl(user.id)}`);
      process.exit(1);
    }
    throw err;
  }
  console.log(`Synced: ${synced} workout(s) to Google Calendar\n`);

  const after = await prisma.scheduledWorkout.findMany({
    where: { userId: user.id, status: "scheduled", startTime: { gte: now } },
    orderBy: { startTime: "asc" },
  });
  console.log("After sync:");
  for (const w of after) {
    console.log(`  ${w.workoutBlockName}: ${w.startTime.toLocaleString()} → event: ${w.calendarEventId ?? "none"}`);
  }

  if (!user.googleAccessToken) {
    console.log("\n(No Google token – sync would create events when user connects calendar)");
  } else {
    console.log("\nDone! Check your Google Calendar.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
