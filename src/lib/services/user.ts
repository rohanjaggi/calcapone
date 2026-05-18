import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import type { AiProvider } from "@/generated/prisma/enums";

export async function findOrCreateUser(telegramId: bigint, username: string) {
  return prisma.user.upsert({
    where: { telegramId },
    update: { telegramUsername: username },
    create: { telegramId, telegramUsername: username },
  });
}

export async function getUserByTelegramId(telegramId: bigint) {
  return prisma.user.findUnique({ where: { telegramId } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUserSettings(
  id: string,
  data: {
    timezone?: string;
    briefingEnabled?: boolean;
    briefingTime?: string | null;
    weeklyDigestEnabled?: boolean;
    aiSuggestionEnabled?: boolean;
    aiProvider?: AiProvider | null;
    aiApiKey?: string | null;
    aiModel?: string | null;
    googleRefreshToken?: string | null;
    googleCalendarId?: string | null;
  }
) {
  const updateData = { ...data };
  if (data.aiApiKey !== undefined) {
    updateData.aiApiKey = data.aiApiKey ? encrypt(data.aiApiKey) : null;
  }
  if (data.googleRefreshToken !== undefined) {
    updateData.googleRefreshToken = data.googleRefreshToken
      ? encrypt(data.googleRefreshToken)
      : null;
  }
  return prisma.user.update({ where: { id }, data: updateData });
}

export function decryptUserApiKey(encrypted: string | null): string | null {
  if (!encrypted) return null;
  return decrypt(encrypted);
}
