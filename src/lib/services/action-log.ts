import { prisma } from "@/lib/prisma";
import { createEvent, deleteEvent, updateEvent, CalendarAuthError } from "@/lib/services/calendar";
import type { Prisma } from "@/generated/prisma/client";
import type { UndoOp, UndoRecord, ItemSnapshot } from "@/lib/services/tool-outcome";

/**
 * The journal (`ActionLog`) makes every reversible mutation replayable in reverse without the
 * model guessing an inverse at undo time — the tool call already knew what it did and wrote
 * the `UndoOp` down. This module is the write side (`recordAction`) and the replay side
 * (`undoLast` / `undoById`), plus the housekeeping that keeps the table small.
 */

export type UndoUser = {
  id: string;
  timezone: string;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
};

export type UndoResult = { ok: true; summary: string } | { ok: false; reason: "none" | "failed" };

/** `/undo` and the ↩️ button only reach back this far — any older and "undo" would surprise the user. */
export const UNDO_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Write a reversible mutation to the journal. Returns the row id (used as callback_data for
 * the ↩️ button), or null on failure.
 *
 * Never throws: this runs *after* the mutation it's logging already succeeded, so a broken
 * journal write must not turn into a failed command — the user just loses the ↩️ button for
 * this one action.
 */
export async function recordAction(
  userId: string,
  chatId: bigint | number | null,
  undo: UndoRecord
): Promise<string | null> {
  try {
    const row = await prisma.actionLog.create({
      data: {
        userId,
        chatId: chatId === null ? null : BigInt(chatId),
        kind: undo.kind,
        summary: undo.summary,
        inverse: undo.inverse as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    console.error("[action-log] failed to record action:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** A `create` colliding with a row that's already there is exactly the outcome an undo wants. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2002" || code === "P2025";
}

/**
 * Rehydrates the date fields a snapshot stores as ISO strings (JSON has no `Date`) and drops
 * keys the snapshot never captured, so an undo only ever touches fields it actually recorded
 * rather than clobbering the rest with an explicit `undefined`.
 *
 * Generic over the input so extra required keys (`recreate_item`'s `title`/`categoryId`,
 * `recreate_event`'s `item.id`) stay required on the way out — a plain `ItemSnapshot ->
 * ItemSnapshot` signature would make Prisma's `create` calls think `title` might be missing.
 */
function revive<T extends ItemSnapshot>(
  snapshot: T
): Omit<T, "remindAt" | "recurrenceEnd"> & { remindAt?: Date | null; recurrenceEnd?: Date | null } {
  const { remindAt, recurrenceEnd, ...rest } = snapshot;
  const out = { ...rest } as Omit<T, "remindAt" | "recurrenceEnd"> & { remindAt?: Date | null; recurrenceEnd?: Date | null };
  if (remindAt !== undefined) out.remindAt = remindAt === null ? null : new Date(remindAt);
  if (recurrenceEnd !== undefined) out.recurrenceEnd = recurrenceEnd === null ? null : new Date(recurrenceEnd);
  for (const key of Object.keys(out) as (keyof typeof out)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/**
 * Applies one compensating action. Not exported: the claim/rollback dance in `claimAndApply`
 * is what callers actually need, this is just the "how" for each `UndoOp` variant.
 */
async function applyUndo(op: UndoOp, user: UndoUser): Promise<void> {
  switch (op.op) {
    case "noop":
      return;

    case "delete_item":
      // deleteMany, not delete: undoing an undo (or a race with a second delete) can find the
      // row already gone, and that's not an error.
      await prisma.item.deleteMany({ where: { id: op.itemId, userId: user.id } });
      return;

    case "restore_item":
      await prisma.item.updateMany({
        where: { id: op.itemId, userId: user.id },
        data: revive(op.fields),
      });
      return;

    case "recreate_item":
      try {
        // Reusing the original id keeps numbered lists and reminder buttons pointing at the
        // right row.
        await prisma.item.create({ data: { id: op.itemId, userId: user.id, ...revive(op.data) } });
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
      return;

    case "delete_event":
      if (!user.googleRefreshToken) return; // never synced to Google; nothing there to undo
      await deleteEvent(user.googleRefreshToken, op.calendarId, op.eventId);
      return;

    case "patch_event":
      if (!user.googleRefreshToken) return;
      await updateEvent(user.googleRefreshToken, op.calendarId, op.eventId, op.fields, user.timezone);
      return;

    case "recreate_event": {
      if (!user.googleRefreshToken) return;
      // A deleted Google event can't keep its old id, which is exactly why the item (if any)
      // has to be recreated pointing at whatever id the new event gets.
      const created = await createEvent(user.googleRefreshToken, op.calendarId, op.event, user.timezone);
      if (op.item) {
        try {
          // `revive` carries `id` through from `op.item` (it's just another own property of
          // the object), so it isn't repeated here.
          await prisma.item.create({
            data: { userId: user.id, ...revive(op.item), googleEventId: created.id },
          });
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
        }
      }
      return;
    }

    case "delete_category":
      await prisma.category.deleteMany({ where: { id: op.categoryId, userId: user.id } });
      return;

    case "sequence": {
      // One user-visible action can be several writes (decomposing a task creates N
      // subtasks), and reversing it has to be a single `/undo`. Best-effort in order: a
      // partially-cleaned-up decompose is still better than leaving all of it, so only a
      // total wipeout is reported back as a failure.
      const errors: unknown[] = [];
      for (const sub of op.ops) {
        try {
          await applyUndo(sub, user);
        } catch (error) {
          console.error("[action-log] sequence member failed:", error instanceof Error ? error.message : error);
          errors.push(error);
        }
      }
      if (op.ops.length > 0 && errors.length === op.ops.length) throw errors[0];
      return;
    }
  }
}

type CandidateRow = { id: string; summary: string; inverse: unknown };

/**
 * Claim-then-apply, shared by `undoLast` and `undoById`. Claiming first (an `updateMany`
 * guarded on `undoneAt: null`) is what makes two taps of the ↩️ button — or a `/undo` racing
 * the button — apply the inverse at most once: only whichever caller wins the update gets to
 * proceed.
 */
async function claimAndApply(row: CandidateRow, user: UndoUser, now: Date): Promise<UndoResult> {
  const claim = await prisma.actionLog.updateMany({
    where: { id: row.id, undoneAt: null },
    data: { undoneAt: now },
  });
  if (claim.count !== 1) return { ok: false, reason: "none" };

  try {
    await applyUndo(row.inverse as UndoOp, user);
    return { ok: true, summary: row.summary };
  } catch (error) {
    // The claim succeeded but applying it didn't — put the row back so a retry (e.g. after
    // reconnecting Google) finds it as "not yet undone" rather than silently stuck.
    await prisma.actionLog.updateMany({ where: { id: row.id }, data: { undoneAt: null } });
    if (error instanceof CalendarAuthError) throw error; // caller shows the reconnect prompt
    return { ok: false, reason: "failed" };
  }
}

/** Undo the most recent not-yet-undone action for this user inside the retention window. */
export async function undoLast(user: UndoUser, now: Date = new Date()): Promise<UndoResult> {
  const cutoff = new Date(now.getTime() - UNDO_RETENTION_MS);
  const row = await prisma.actionLog.findFirst({
    where: { userId: user.id, undoneAt: null, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
    select: { id: true, summary: true, inverse: true },
  });
  if (!row) return { ok: false, reason: "none" };
  return claimAndApply(row, user, now);
}

/** Undo one specific journal entry (the ↩️ button on a receipt). */
export async function undoById(actionId: string, user: UndoUser, now: Date = new Date()): Promise<UndoResult> {
  const cutoff = new Date(now.getTime() - UNDO_RETENTION_MS);
  const row = await prisma.actionLog.findFirst({
    where: { id: actionId, userId: user.id, undoneAt: null, createdAt: { gte: cutoff } },
    select: { id: true, summary: true, inverse: true },
  });
  if (!row) return { ok: false, reason: "none" };
  return claimAndApply(row, user, now);
}

/** Housekeeping: drop journal rows past the retention window — neither undo function will ever select them again. */
export async function pruneActionLog(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UNDO_RETENTION_MS);
  const result = await prisma.actionLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
