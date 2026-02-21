import "dotenv/config";
import { prisma } from "../lib/db.js";
import { generateWorkoutPlan } from "../lib/workoutPlan.js";
import { createCalendarEvent } from "../lib/calendar.js";
import { saveScheduledWorkout } from "../lib/db.js";
import { sendSms } from "../lib/sms.js";

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found. Sign up first.");
    return;
  }

  console.log(`Found user: ${user.email} (${user.id})`);
  console.log(`Google token: ${user.googleAccessToken ? "YES" : "NO"}`);

  // Clear old scheduled workouts
  await prisma.scheduledWorkout.deleteMany({ where: { userId: user.id } });
  console.log("Cleared old workouts.");

  // Generate plan
  const plan = generateWorkoutPlan(user);
  const block = plan.blocks[0]; // First workout block

  // Schedule a test workout for TODAY, 30 minutes from now
  const now = new Date();
  const start = new Date(now.getTime() + 30 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);

  console.log(`\nScheduling test workout: "${block.name}"`);
  console.log(`  Start: ${start.toLocaleString()}`);
  console.log(`  End:   ${end.toLocaleString()}`);

  // Create Google Calendar event
  const eventId = await createCalendarEvent(user, {
    start,
    end,
    title: `Gym – ${block.name}`,
    description: block.exercises
      .map((e) => `• ${e.name}: ${e.sets}×${e.reps}`)
      .join("\n") + "\n\nScheduled by GymBuddy",
  });

  if (eventId) {
    console.log(`  Calendar event created: ${eventId}`);
  } else {
    console.log("  Calendar event: STUB (no Google token)");
  }

  // Save to DB
  await saveScheduledWorkout({
    userId: user.id,
    workoutBlockName: block.name,
    startTime: start,
    endTime: end,
    calendarEventId: eventId ?? undefined,
    status: "scheduled",
  });
  console.log("  Saved to database.");

  // Send SMS reminder NOW
  const travelMin = user.gymTravelMin;
  console.log(`\nSending SMS to ${user.phoneNumber}...`);
  await sendSms(
    user.phoneNumber,
    `Hey! Your "${block.name}" workout is in 30 minutes (${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}). That's ${travelMin} min to get to the gym. Time to get moving! Reply "can't make it" to reschedule.`
  );
  console.log("  SMS sent!");

  // Also schedule the rest of the week on the calendar
  console.log("\nScheduling remaining workouts for the week...");
  for (let i = 1; i < plan.blocks.length && i < plan.daysPerWeek; i++) {
    const b = plan.blocks[i];
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + i);
    dayStart.setHours(9, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 60 * 60_000);

    const eid = await createCalendarEvent(user, {
      start: dayStart,
      end: dayEnd,
      title: `Gym – ${b.name}`,
      description: b.exercises
        .map((e) => `• ${e.name}: ${e.sets}×${e.reps}`)
        .join("\n") + "\n\nScheduled by GymBuddy",
    });

    await saveScheduledWorkout({
      userId: user.id,
      workoutBlockName: b.name,
      startTime: dayStart,
      endTime: dayEnd,
      calendarEventId: eid ?? undefined,
      status: "scheduled",
    });

    console.log(`  ${b.name}: ${dayStart.toLocaleDateString()} at 9am ${eid ? `(event: ${eid})` : "(stub)"}`);
  }

  console.log("\nDone! Check your Google Calendar and phone.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
