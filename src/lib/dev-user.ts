import { prisma } from "@/lib/prisma";

export async function getOrCreateDevUser() {
  const devTelegramId = BigInt(123456789);

  const user = await prisma.user.upsert({
    where: { telegramId: devTelegramId },
    update: {},
    create: {
      telegramId: devTelegramId,
      telegramUsername: "Rohan",
      timezone: "Asia/Singapore",
    },
  });

  return user;
}
