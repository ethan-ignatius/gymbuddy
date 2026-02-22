import "dotenv/config";
import { prisma } from "../lib/db.js";
import { sendSms } from "../lib/sms.js";

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) { console.log("No user"); return; }
  console.log("User step:", user.onboardingStep);
  console.log("Days:", user.preferredDays);

  await sendSms(
    user.phoneNumber,
    "Monday, Tuesday, Wednesday, Thursday — nice spread! What time do you prefer to work out?\n\n• Morning (6am–11am)\n• Afternoon (12pm–4pm)\n• Evening (5pm–9pm)"
  );
  console.log("Sent!");
}

main().finally(() => prisma.$disconnect());
