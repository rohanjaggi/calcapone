import { prisma } from "@/lib/prisma";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";
import { getNextOccurrence } from "@/lib/services/recurrence";
import { buildEmbeddingText, scheduleItemEmbedding } from "@/lib/services/embeddings";

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
  /** A single status, or several (e.g. everything still open). */
  status?: ItemStatus | ItemStatus[];
  categoryId?: string;
  priority?: Priority;
};

/** Everything that isn't finished — what "my tasks" means to a user. */
export const OPEN_STATUSES: ItemStatus[] = ["pending", "in_progress"];

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
  await scheduleItemEmbedding(item.id, text);

  return item;
}

export async function listItems(userId: string, filters: ItemFilters = {}) {
  const { status, ...rest } = filters;
  return prisma.item.findMany({
    where: {
      userId,
      parentId: null,
      ...rest,
      ...(Array.isArray(status) ? { status: { in: status } } : status ? { status } : {}),
    },
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
  const payload: UpdateItemInput & { notificationStage?: number } = { ...data };

  // Deadline escalation (24h / 2h / overdue) only fires once per stage. Rescheduling an item
  // or reopening a completed one starts a new deadline, so the stage counter has to reset —
  // otherwise an overdue task moved to next week never alerts again.
  const touchesDeadline = data.dueDate !== undefined || data.dueTime !== undefined;
  const mayReopen = data.status !== undefined && data.status !== "done";
  if (touchesDeadline || mayReopen) {
    const current = await prisma.item.findUnique({
      where: { id, userId },
      select: { status: true, dueDate: true, dueTime: true, notificationStage: true },
    });
    if (current && current.notificationStage > 0) {
      const deadlineChanged =
        (data.dueDate !== undefined && data.dueDate !== current.dueDate) ||
        (data.dueTime !== undefined && data.dueTime !== current.dueTime);
      const reopened = mayReopen && current.status === "done";
      if (deadlineChanged || reopened) payload.notificationStage = 0;
    }
  }

  const item = await prisma.item.update({
    where: { id, userId },
    data: payload,
    include: { category: true },
  });

  if (data.title !== undefined || data.description !== undefined || data.categoryId !== undefined) {
    const text = buildEmbeddingText({ title: item.title, description: item.description, category: item.category.name });
    await scheduleItemEmbedding(item.id, text);
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

/**
 * Put a claimed reminder back because delivery failed.
 *
 * `claimDueReminder` clears `remindAt` *before* the send so overlapping runs can't
 * double-fire — which means a Telegram outage, rate limit, or 5xx would otherwise swallow
 * the reminder permanently. Restoring leaves the item due so the next tick retries it.
 *
 * Guarded on `remindAt: null` so a reminder the user re-armed in the meantime is never
 * clobbered by a late failure from the previous attempt.
 */
export async function restoreDueReminder(id: string, remindAt: Date, status: ItemStatus): Promise<boolean> {
  const result = await prisma.item.updateMany({
    where: { id, remindAt: null },
    data: { remindAt, status },
  });
  return result.count === 1;
}

/** Re-arm a fired reminder. Status returns to pending because firing may have completed it. */
export async function snoozeReminder(id: string, userId: string, remindAt: Date) {
  return prisma.item.update({
    where: { id, userId },
    data: { remindAt, status: "pending" as ItemStatus },
  });
}

/** Single item scoped to its owner — used by the reminder action buttons. */
export async function getItem(id: string, userId: string) {
  return prisma.item.findFirst({ where: { id, userId } });
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
