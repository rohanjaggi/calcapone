import { prisma } from "@/lib/prisma";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";

type CreateItemInput = {
  userId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: Date | null;
  recurring?: RecurringType;
  googleEventId?: string | null;
};

type ItemFilters = {
  status?: ItemStatus;
  categoryId?: string;
  priority?: Priority;
};

type UpdateItemInput = {
  title?: string;
  description?: string | null;
  status?: ItemStatus;
  priority?: Priority;
  categoryId?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: Date | null;
  recurring?: RecurringType;
  googleEventId?: string | null;
};

export async function createItem(data: CreateItemInput) {
  return prisma.item.create({
    data,
    include: { category: true },
  });
}

export async function listItems(userId: string, filters: ItemFilters = {}) {
  return prisma.item.findMany({
    where: { userId, ...filters },
    include: { category: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateItem(id: string, userId: string, data: UpdateItemInput) {
  return prisma.item.update({
    where: { id, userId },
    data,
    include: { category: true },
  });
}

export async function deleteItem(id: string, userId: string) {
  return prisma.item.delete({ where: { id, userId } });
}

export async function getDueItems(now: Date) {
  return prisma.item.findMany({
    where: { remindAt: { lte: now }, status: { not: "done" } },
    include: { user: true, category: true },
  });
}

export async function markItemSent(id: string) {
  return prisma.item.update({
    where: { id },
    data: { status: "done" },
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
