import { prisma } from "@/lib/prisma";
import type { RecurringType, ReminderStatus } from "@/generated/prisma/enums";

type CreateReminderInput = {
  userId: string;
  message: string;
  remindAt: Date;
  recurring?: RecurringType;
  categoryId?: string | null;
  todoId?: string | null;
};

type ReminderFilters = {
  status?: ReminderStatus;
  categoryId?: string;
};

export async function createReminder(data: CreateReminderInput) {
  return prisma.reminder.create({
    data,
    include: { category: true, todo: true },
  });
}

export async function listReminders(userId: string, filters: ReminderFilters = {}) {
  return prisma.reminder.findMany({
    where: { userId, ...filters },
    include: { category: true, todo: true },
    orderBy: { remindAt: "asc" },
  });
}

export async function getDueReminders(now: Date) {
  return prisma.reminder.findMany({
    where: { remindAt: { lte: now }, status: "pending" },
    include: { user: true, todo: true },
  });
}

export async function markSent(id: string) {
  return prisma.reminder.update({
    where: { id },
    data: { status: "sent" },
  });
}

export async function cancelReminder(id: string, userId: string) {
  return prisma.reminder.update({
    where: { id, userId },
    data: { status: "cancelled" },
  });
}

export function createNextOccurrence(current: Date, recurring: RecurringType): Date {
  const next = new Date(current);
  switch (recurring) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next;
}
