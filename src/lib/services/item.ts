import { prisma } from "@/lib/prisma";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";
import { getNextOccurrence } from "@/lib/services/recurrence";
import { buildEmbeddingText, upsertItemEmbedding } from "@/lib/services/embeddings";

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
  recurrenceRule?: string | null;
  recurrenceEnd?: Date | null;
  googleEventId?: string | null;
  parentId?: string | null;
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
  recurrenceRule?: string | null;
  recurrenceEnd?: Date | null;
  googleEventId?: string | null;
};

export async function createItem(data: CreateItemInput) {
  const item = await prisma.item.create({
    data,
    include: { category: true },
  });

  const text = buildEmbeddingText({ title: item.title, description: item.description, category: item.category.name });
  void upsertItemEmbedding(item.id, text).catch(() => {});

  return item;
}

export async function listItems(userId: string, filters: ItemFilters = {}) {
  return prisma.item.findMany({
    where: { userId, parentId: null, ...filters },
    include: { category: true, subtasks: { include: { category: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function listSubtasks(parentId: string, userId: string) {
  return prisma.item.findMany({
    where: { parentId, userId },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateItem(id: string, userId: string, data: UpdateItemInput) {
  const item = await prisma.item.update({
    where: { id, userId },
    data,
    include: { category: true },
  });

  if (data.title !== undefined || data.description !== undefined || data.categoryId !== undefined) {
    const text = buildEmbeddingText({ title: item.title, description: item.description, category: item.category.name });
    void upsertItemEmbedding(item.id, text).catch(() => {});
  }

  return item;
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

/**
 * Atomically claim a due reminder so overlapping cron runs can't both send it.
 * Returns false if another run already claimed it. Pure reminders (no due date) and
 * recurring occurrences are marked done; a dated task keeps its status so deadline
 * escalation can still follow up on it.
 */
export async function claimDueReminder(id: string, markDone: boolean): Promise<boolean> {
  const result = await prisma.item.updateMany({
    where: { id, remindAt: { not: null } },
    data: { remindAt: null, ...(markDone ? { status: "done" as ItemStatus } : {}) },
  });
  return result.count === 1;
}

const LEGACY_RULES: Record<string, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

/**
 * Next occurrence after `current` (and after `now`, if given, so a backlog of missed
 * occurrences collapses to the next future one). Legacy daily/weekly/monthly items are
 * routed through rrule too, which handles month-end correctly.
 */
export function createNextOccurrence(
  current: Date,
  recurring: RecurringType,
  recurrenceRule?: string | null,
  now?: Date
): Date | null {
  const rule = recurrenceRule || LEGACY_RULES[recurring];
  if (!rule) return null;
  return getNextOccurrence(rule, current, now);
}

export async function getEscalationCandidates() {
  return prisma.item.findMany({
    where: {
      status: { not: "done" },
      dueDate: { not: null },
      remindAt: null,
      notificationStage: { lt: 3 },
      parentId: null,
    },
    include: { user: true, category: true },
  });
}

export async function updateNotificationStage(id: string, stage: number) {
  return prisma.item.update({
    where: { id },
    data: { notificationStage: stage },
  });
}
