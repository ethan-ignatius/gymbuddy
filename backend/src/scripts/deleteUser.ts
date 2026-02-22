/**
 * Delete a user by email. Run: npx tsx src/scripts/deleteUser.ts <email>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "adamwang.aw.2006@gmail.com";
  const deleted = await prisma.user.deleteMany({
    where: { email },
  });
  console.log(`Deleted ${deleted.count} user(s) with email: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
