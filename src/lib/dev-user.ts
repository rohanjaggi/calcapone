import { prisma } from "@/lib/prisma";

export async function getOrCreateDevUser() {
  const telegramId = BigInt(process.env.TELEGRAM_USER_ID || "123456789");

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {},
    create: {
      telegramId,
      telegramUsername: "Rohan",
      timezone: "Asia/Singapore",
    },
  });

  return user;
}
