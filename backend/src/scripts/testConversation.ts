import "dotenv/config";
import { prisma } from "../lib/db.js";
import { handleConversation, startOnboarding } from "../lib/conversation.js";
import { sendPreWorkoutNudges } from "../lib/nudge.js";

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found. Sign up first at http://localhost:5173");
    return;
  }

  console.log(`Testing conversation with: ${user.email} (${user.phoneNumber})`);
  console.log(`Current onboarding step: ${user.onboardingStep}`);
  console.log(`Google token: ${user.googleAccessToken ? "YES" : "NO"}\n`);

  // Reset onboarding to test from scratch
  await prisma.scheduledWorkout.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: "awaiting_days", preferredDays: null, daysPerWeek: null, preferredTime: null },
  });

  console.log("--- Starting onboarding ---\n");
  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!freshUser) return;

  // Step 1: Start onboarding (sends first text)
  console.log("[BOT] Sending welcome message...");
  await startOnboarding(freshUser);

  // Step 2: User replies with days
  console.log('\n[USER] "4 days - Mon, Wed, Fri, Sat"\n');
  let updated = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updated) return;
  await handleConversation(updated, "4 days - Mon, Wed, Fri, Sat");

  // Step 3: User replies with time preference
  console.log('\n[USER] "Morning"\n');
  updated = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updated) return;
  await handleConversation(updated, "Morning");

  // Step 4: User confirms
  console.log('\n[USER] "Yeah let\'s go"\n');
  updated = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updated) return;
  await handleConversation(updated, "Yeah let's go");

  // Check final state
  updated = await prisma.user.findUnique({ where: { id: user.id } });
  console.log(`\n--- Final state ---`);
  console.log(`Onboarding: ${updated?.onboardingStep}`);
  console.log(`Days: ${updated?.preferredDays}`);
  console.log(`Time: ${updated?.preferredTime}`);

  const workouts = await prisma.scheduledWorkout.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "asc" },
  });
  console.log(`\nScheduled workouts: ${workouts.length}`);
  for (const w of workouts) {
    console.log(`  ${w.workoutBlockName}: ${w.startTime.toLocaleString()} (event: ${w.calendarEventId ?? "none"})`);
  }

  // Trigger a pre-workout nudge test
  console.log("\n--- Testing pre-workout nudge ---");
  await sendPreWorkoutNudges();

  console.log("\nDone! Check your phone for texts and your Google Calendar for events.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
