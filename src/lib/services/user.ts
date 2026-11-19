import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { RRule } from "rrule";
import type { AiProvider, Priority } from "@/generated/prisma/enums";

/**
 * Read before write: this runs on every incoming message, and an unconditional upsert wrote
 * a row each time. Only touch the database when the user is new or renamed themselves.
 */
export async function findOrCreateUser(telegramId: bigint, username: string) {
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    if (existing.telegramUsername === username) return existing;
    return prisma.user.update({ where: { telegramId }, data: { telegramUsername: username } });
  }
  const newUser = await prisma.user.upsert({
    where: { telegramId },
    update: { telegramUsername: username },
    create: { telegramId, telegramUsername: username },
  });

  // Seed default categories for newly created users.
  // Use skipDuplicates to handle race where two messages arrive simultaneously.
  await prisma.category.createMany({
    data: [
      { userId: newUser.id, name: "General", color: "#4A6FA5", sortOrder: 0 },
      { userId: newUser.id, name: "School", color: "#B8860B", sortOrder: 1 },
      { userId: newUser.id, name: "Personal", color: "#A8A29E", sortOrder: 2 },
    ],
    skipDuplicates: true,
  });

  return newUser;
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
    aiProvider?: AiProvider | null;
    aiApiKey?: string | null;
    aiModel?: string | null;
    googleRefreshToken?: string | null;
    googleCalendarId?: string | null;
    quietStart?: string | null;
    quietEnd?: string | null;
    notifyMinPriority?: Priority;
    digestDay?: number;
    digestTime?: string;
    eventReminderMinutes?: number | null;
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

/**
 * Switch a user's timezone and keep every pending reminder at the same clock time there:
 * "9am meds" means 9am where the user is, not the instant 9am was in the old zone. Repeating
 * rules are restarted the same way, since their times are read in the user's zone.
 * Returns how many reminders moved.
 */
export async function changeTimezone(userId: string, from: string, to: string): Promise<number> {
  const sameClock = (at: Date) => fromZonedTime(formatInTimeZone(at, from, "yyyy-MM-dd'T'HH:mm:ss"), to);
  const items = await prisma.item.findMany({
    where: { userId, status: { not: "done" }, remindAt: { not: null } },
    select: { id: true, remindAt: true, recurrenceRule: true },
  });
  const restart = (rule: string | null) => {
    if (!rule) return rule;
    const options = RRule.parseString(rule);
    return options.dtstart ? new RRule({ ...options, dtstart: sameClock(options.dtstart) }).toString() : rule;
  };
  await prisma.$transaction([
    ...items.map((item) =>
      prisma.item.update({
        where: { id: item.id },
        data: { remindAt: sameClock(item.remindAt!), recurrenceRule: restart(item.recurrenceRule) },
      })
    ),
    prisma.user.update({ where: { id: userId }, data: { timezone: to } }),
  ]);
  return items.length;
}
