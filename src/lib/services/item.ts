import { prisma } from "@/lib/prisma";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";
import { getNextOccurrence } from "@/lib/services/recurrence";
import { buildEmbeddingText, scheduleItemEmbedding } from "@/lib/services/embeddings";
import { MAX_ESCALATION_STAGE } from "@/lib/services/escalation";

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
  seriesId?: string | null;
};

type ItemFilters = {
  /** A single status, or several (e.g. everything still open). */
  status?: ItemStatus | ItemStatus[];
  categoryId?: string;
  priority?: Priority;
};

/** Everything that isn't finished — what "my tasks" means to a user. */
export const OPEN_STATUSES: ItemStatus[] = ["pending", "in_progress"];

const LEGACY_RULES: Record<string, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
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
  calendarSyncedAt?: Date | null;
};

export async function createItem(data: CreateItemInput) {
  const item = await prisma.item.create({
    data,
    include: { category: true },
  });

  // The first occurrence of a run names the series, so "stop the daily meds reminder" can
  // reach every future copy rather than only the one the user happens to be looking at.
  if (data.recurrenceRule && !data.seriesId) {
    await prisma.item.update({ where: { id: item.id }, data: { seriesId: item.id } });
    item.seriesId = item.id;
  }

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

/**
 * The board pages' item set: everything still open, plus recently completed work.
 *
 * `listItems(userId)` with no filter returns every item the user has ever created, including
 * every completed one, on every page load — fine at a few hundred rows, a cliff in the low
 * thousands. Open items stay unbounded because an overdue task from last year is still work;
 * completed items are history, so they are capped to a recent window.
 */
export async function listItemsForBoard(
  userId: string,
  { days, take, categoryId }: { days: number; take: number; categoryId?: string },
  now: Date = new Date()
) {
  const include = {
    category: true,
    subtasks: { include: { category: true }, orderBy: { createdAt: "asc" as const } },
  };
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const scope = { userId, parentId: null, ...(categoryId ? { categoryId } : {}) };

  const [open, done] = await Promise.all([
    prisma.item.findMany({
      where: { ...scope, status: { in: OPEN_STATUSES } },
      include,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
    prisma.item.findMany({
      where: { ...scope, status: "done", updatedAt: { gte: cutoff } },
      include,
      orderBy: { updatedAt: "desc" },
      take,
    }),
  ]);

  return [...open, ...done];
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
  const completing = data.status === "done";

  let before: Awaited<ReturnType<typeof prisma.item.findUnique>> = null;
  if (touchesDeadline || mayReopen || completing) {
    before = await prisma.item.findUnique({ where: { id, userId } });
    if (before && before.notificationStage > 0) {
      const deadlineChanged =
        (data.dueDate !== undefined && data.dueDate !== before.dueDate) ||
        (data.dueTime !== undefined && data.dueTime !== before.dueTime);
      const reopened = mayReopen && before.status === "done";
      if (deadlineChanged || reopened) payload.notificationStage = 0;
    }
  }

  // Completion is a one-way transition that also rolls the series forward, so a double-tapped
  // Done button (two concurrent calls) must not both win it — same claim-then-act shape as
  // claimDueReminder/claimNotificationStage: only the call that actually flips the row's
  // status away from "done" gets to roll forward.
  let completed = false;
  let item;
  if (completing) {
    const claim = await prisma.item.updateMany({
      where: { id, userId, status: { not: "done" } },
      data: payload,
    });
    completed = claim.count === 1;
    item = await prisma.item.findUniqueOrThrow({ where: { id, userId }, include: { category: true } });
  } else {
    item = await prisma.item.update({
      where: { id, userId },
      data: payload,
      include: { category: true },
    });
  }

  if (completed && before) {
    await rollForwardDatedSeries(before);
  }

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
    // `status` is re-checked here, not just in getDueItems: an item completed between the
    // fetch and this claim would otherwise still fire a reminder for finished work.
    where: { id, remindAt: { not: null }, status: { not: "done" } },
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
export async function restoreDueReminder(
  id: string,
  remindAt: Date,
  /**
   * Only pass a status when the claim actually changed one. Writing a remembered status
   * back unconditionally would un-complete an item the user finished (via the Done button)
   * while the failing send was still being retried.
   */
  status: ItemStatus | null
): Promise<boolean> {
  const result = await prisma.item.updateMany({
    where: { id, remindAt: null },
    data: { remindAt, ...(status ? { status } : {}) },
  });
  return result.count === 1;
}

/**
 * A repeating task with a *due date* rolls forward when it is completed, not when a reminder
 * fires — a weekly reading with no alarm attached would otherwise vanish the first time it
 * was ticked off. Reminder-driven recurrence is advanced by the cron instead, so items with
 * a `remindAt` are left alone here to avoid creating the next occurrence twice.
 */
async function rollForwardDatedSeries(before: {
  id: string;
  userId: string;
  categoryId: string;
  seriesId: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  dueTime: string | null;
  remindAt: Date | null;
  recurring: RecurringType;
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
}): Promise<void> {
  if (before.remindAt || !before.dueDate) return;
  const rule = before.recurrenceRule || LEGACY_RULES[before.recurring];
  if (!rule) return;

  const nextDate = nextDueDate(before.dueDate, rule);
  if (!nextDate) return;
  if (before.recurrenceEnd && startOfUtcDay(nextDate) > before.recurrenceEnd) return;

  await createItem({
    userId: before.userId,
    categoryId: before.categoryId,
    seriesId: before.seriesId ?? before.id,
    title: before.title,
    description: before.description,
    priority: before.priority,
    dueDate: nextDate,
    dueTime: before.dueTime,
    recurring: before.recurring,
    recurrenceRule: before.recurrenceRule,
    recurrenceEnd: before.recurrenceEnd,
  });
}

function startOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * The next calendar day a `YYYY-MM-DD` due date lands on.
 *
 * Deliberately timezone-free: a due *date* has no clock time, so anchoring the rule at UTC
 * midnight and reading the day back out keeps "every other Tuesday" on a Tuesday everywhere,
 * which converting through a zone would not.
 */
export function nextDueDate(dueDate: string, rule: string): string | null {
  const next = getNextOccurrence(rule, startOfUtcDay(dueDate));
  return next ? next.toISOString().slice(0, 10) : null;
}

/** Every item in the same repeating run, including the one that named it. */
export async function listSeries(seriesId: string, userId: string) {
  return prisma.item.findMany({ where: { userId, OR: [{ seriesId }, { id: seriesId }] } });
}

/**
 * Apply the same change to every occurrence in a run ("move the daily standup to 10am").
 * Returns the members as they were *before* the change, which is what an undo needs.
 */
export async function updateSeries(seriesId: string, userId: string, data: UpdateItemInput) {
  const members = await listSeries(seriesId, userId);
  for (const member of members) {
    await updateItem(member.id, userId, data);
  }
  return members;
}

/** Drop a whole repeating run. Returns how many rows went. */
export async function deleteSeries(seriesId: string, userId: string): Promise<number> {
  const result = await prisma.item.deleteMany({ where: { userId, OR: [{ seriesId }, { id: seriesId }] } });
  return result.count;
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
      parentId: null,
      notificationStage: { lt: MAX_ESCALATION_STAGE },
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

/**
 * Claim an escalation stage before alerting, so two overlapping cron ticks can't both pass
 * the stage check and send the same "Due soon" twice. Roll back with
 * {@link updateNotificationStage} if the send then fails.
 */
export async function claimNotificationStage(id: string, fromStage: number, toStage: number): Promise<boolean> {
  const result = await prisma.item.updateMany({
    where: { id, notificationStage: fromStage },
    data: { notificationStage: toStage },
  });
  return result.count === 1;
}
