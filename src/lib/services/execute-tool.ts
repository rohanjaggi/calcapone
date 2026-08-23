import {
  createItem,
  listItems,
  updateItem,
  deleteItem,
  updateSeries,
  deleteSeries,
  listSeries,
  nextDueDate,
  OPEN_STATUSES,
} from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { getEvents, createEvent, updateEvent, deleteEvent, CalendarAuthError } from "@/lib/services/calendar";
import { mirrorEvent, unmirrorEvent } from "@/lib/services/calendar-sync";
import { markCalendarDisconnected, CALENDAR_RECONNECT_MESSAGE } from "@/lib/services/calendar-link";
import { searchItems } from "@/lib/services/search";
import { paramsToRRule, getNextOccurrence, dueDateAnchor, type RecurrenceParams } from "@/lib/services/recurrence";
import { matchByTitle } from "@/lib/services/match-items";
import { renderFlatList } from "@/lib/services/commands/format";
import { dueWindowToGcal } from "@/lib/services/gcal-window";
import { esc, b } from "@/lib/services/telegram";
import { parseInTz, todayInTz, formatDateInTz, formatHHmmInTz, startOfDayInTz } from "@/lib/tz";
import { normalizeDueDate, normalizeDueTime } from "@/lib/due-format";
import { readOutcome, echoOutcome, type ToolOutcome, type ItemSnapshot, type EventSnapshot, type UndoOp } from "@/lib/services/tool-outcome";
import type { Priority, RecurringType, ItemStatus } from "@/generated/prisma/enums";

function fuzzyMatch(title: string, query: string): boolean {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  return t.includes(q) || q.includes(t);
}

/**
 * Set by the disambiguation buttons, never by the model.
 *
 * When a title matched several items the original call is parked and re-run with the id the
 * user tapped. Carrying that as a reserved argument means every tool keeps one code path:
 * the resolver either honours an explicit id or falls back to matching.
 */
export const FORCED_ITEM_ID = "__item_id";

type UserContext = {
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  timezone: string;
};

/**
 * A required string argument. Tool schemas aren't `strict`, so a model can omit or mistype
 * any field; reading it blind used to throw a TypeError that surfaced as "Sorry, error".
 */
function requireStr(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * A required argument was absent. Flagged as failed for the same reason `refuse` is: the model
 * is one round away from supplying it, and only sees that it needs to if the result says so.
 */
function missing(key: string): ToolOutcome {
  return refuse(`I need a ${key.replace(/_/g, " ")} for that — could you say it again with more detail?`);
}

/** Something the model asked for cannot be done. The model sees it and can correct itself. */
function refuse(text: string): ToolOutcome {
  return { text, echo: true, failed: true };
}

/**
 * "Every occurrence" or "just this one".
 *
 * Defaults to `this`: silently rewriting a whole repeating run because the model guessed is
 * far worse than the user having to say "all of them".
 */
function asScope(value: unknown): "this" | "series" {
  return value === "series" ? "series" : "this";
}

type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  status: ItemStatus;
  priority: Priority;
  categoryId: string;
  dueDate: string | null;
  dueTime: string | null;
  remindAt: Date | null;
  recurring: RecurringType;
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
  googleEventId: string | null;
  parentId: string | null;
  notificationStage: number;
  seriesId: string | null;
};

/**
 * The state to put an item back into.
 *
 * Timestamps become ISO strings because this ends up in a JSON column, and a revived `Date`
 * would come back as a string and be written to a timestamp column verbatim.
 */
function snapshot(item: ItemRow): ItemSnapshot & { title: string; categoryId: string } {
  return {
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    categoryId: item.categoryId,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt ? item.remindAt.toISOString() : null,
    recurring: item.recurring,
    recurrenceRule: item.recurrenceRule,
    recurrenceEnd: item.recurrenceEnd ? item.recurrenceEnd.toISOString() : null,
    googleEventId: item.googleEventId,
    parentId: item.parentId,
    notificationStage: item.notificationStage,
    // Without this an undone occurrence comes back detached from its run, and no tool can
    // re-attach it — "delete the whole series" would then miss the row it just restored.
    seriesId: item.seriesId,
  };
}

/**
 * The legacy `recurring` column for a rich rule.
 *
 * Reminders read `recurrenceRule`, but the dashboard badge still reads this enum, so leaving
 * it at "none" shows a repeating item as one-off. Yearly has no legacy equivalent.
 */
function legacyRecurring(frequency: RecurrenceParams["frequency"]): RecurringType {
  return frequency === "daily" || frequency === "weekly" || frequency === "monthly" ? frequency : "none";
}

type ItemEditFields = { title?: string; dueDate?: string | null; dueTime?: string | null };
type GcalFields = { title?: string; startTime?: string; endTime?: string; description?: string };

/**
 * Push an item edit to the Google event it is linked to, returning what was actually sent.
 *
 * The window is rebuilt from the item's own date and time merged with the change, because a
 * series member carries its own date — and because a time-only edit still has to move the
 * event. Returns null when nothing was pushed, which is what tells the caller whether the
 * undo needs a calendar half at all.
 */
async function syncLinkedEvent(
  user: UserContext,
  item: { googleEventId: string | null; dueDate: string | null; dueTime: string | null },
  updates: ItemEditFields
): Promise<GcalFields | null> {
  if (!item.googleEventId || !user.googleRefreshToken) return null;

  const fields: GcalFields = {};
  if (updates.title) fields.title = updates.title;
  if (updates.dueDate !== undefined || updates.dueTime !== undefined) {
    const dueDate = updates.dueDate !== undefined ? updates.dueDate : item.dueDate;
    const dueTime = updates.dueTime !== undefined ? updates.dueTime : item.dueTime;
    if (dueDate && dueTime) Object.assign(fields, dueWindowToGcal(dueDate, dueTime));
  }
  if (Object.keys(fields).length === 0) return null;

  try {
    await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId, fields, user.timezone);
  } catch (error) {
    if (error instanceof CalendarAuthError) throw error;
    console.error("[tool:update_item] calendar sync failed:", error instanceof Error ? error.message : error);
    return null;
  }
  return fields;
}

/**
 * The calendar half of an undo: put back exactly the fields the forward call pushed.
 *
 * Without it, undoing a synced reschedule reverts the row and leaves the Google event at the
 * new time — for good, since nothing re-syncs until the date changes again.
 */
function inverseEventPatch(
  user: UserContext,
  before: { googleEventId: string | null; title: string; dueDate: string | null; dueTime: string | null },
  pushed: GcalFields | null
): UndoOp | null {
  if (!pushed || !before.googleEventId) return null;
  const fields: Partial<EventSnapshot> = {};
  if (pushed.title !== undefined) fields.title = before.title;
  if (pushed.startTime !== undefined && before.dueDate && before.dueTime) {
    Object.assign(fields, dueWindowToGcal(before.dueDate, before.dueTime));
  }
  if (Object.keys(fields).length === 0) return null;
  return { op: "patch_event", calendarId: user.googleCalendarId ?? "primary", eventId: before.googleEventId, fields };
}

/**
 * Reflect a Google write the app just made into the local mirror.
 *
 * The dashboard reads the mirror and never Google (agenda.ts), so without this an event the
 * bot has just confirmed to the user stays invisible — or stale — on their own dashboard
 * until the next sync pass, while the calendar page, which reads Google live, already agrees
 * with the user.
 *
 * Takes Google's own response rather than the values we sent, so the mirror records what the
 * calendar actually stored. A response with no parseable window is skipped: an all-day event
 * comes back carrying `date` instead of `dateTime`, which surfaces here as an empty string,
 * and an Invalid Date would poison the row the dashboard reads. The next sync mirrors it
 * properly.
 *
 * Best-effort on purpose: Google has already accepted the write, so a mirror failure must not
 * turn a successful tool call into a reported failure.
 */
async function writeThroughEvent(
  userId: string,
  calendarId: string,
  event: { id: string; title: string; startTime: string; endTime: string },
  tool: string
): Promise<void> {
  const startsAt = new Date(event.startTime);
  const endsAt = new Date(event.endTime);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return;

  try {
    await mirrorEvent(userId, calendarId, {
      googleEventId: event.id,
      title: event.title,
      startsAt,
      endsAt,
    });
  } catch (error) {
    console.error(`[tool:${tool}] mirror write failed:`, error instanceof Error ? error.message : error);
  }
}

/** The delete half of write-through, on the same best-effort terms. */
async function writeThroughDelete(userId: string, googleEventId: string, tool: string): Promise<void> {
  try {
    await unmirrorEvent(userId, googleEventId);
  } catch (error) {
    console.error(`[tool:${tool}] mirror delete failed:`, error instanceof Error ? error.message : error);
  }
}

/** Best-effort removal of the Google event behind an item being deleted. */
async function deleteLinkedEvent(user: UserContext, googleEventId: string | null, tool: string): Promise<void> {
  if (!googleEventId || !user.googleRefreshToken) return;
  try {
    await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", googleEventId);
  } catch (error) {
    if (error instanceof CalendarAuthError) throw error;
    console.error(`[tool:${tool}] calendar delete failed:`, error instanceof Error ? error.message : error);
  }
}

type Resolution<T> = { kind: "one"; item: T } | { kind: "stop"; outcome: ToolOutcome };

/**
 * Which item did the user mean?
 *
 * Picking the first of several silently completed and deleted the wrong task, so an
 * ambiguous title is returned as a set of candidates for the caller to turn into buttons
 * rather than resolved by guesswork.
 */
function resolveItem<T extends { id: string; title: string }>(
  items: T[],
  args: Record<string, unknown>,
  query: string,
  tool: string,
  verb: string,
  notFound: string
): Resolution<T> {
  const forced = typeof args[FORCED_ITEM_ID] === "string" ? (args[FORCED_ITEM_ID] as string) : null;
  if (forced) {
    const item = items.find((candidate) => candidate.id === forced);
    return item
      ? { kind: "one", item }
      : { kind: "stop", outcome: echoOutcome("That item no longer exists.") };
  }

  const match = matchByTitle(items, query);
  if (match.kind === "none") return { kind: "stop", outcome: refuse(notFound) };
  if (match.kind === "one") return { kind: "one", item: match.item };

  return {
    kind: "stop",
    outcome: {
      text: `That matches ${match.items.length} items — which one should I ${verb}?`,
      echo: true,
      choose: {
        tool,
        args,
        candidates: match.items.slice(0, 5).map((item) => ({ id: item.id, title: item.title })),
      },
    },
  };
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  user: UserContext
): Promise<ToolOutcome> {
  try {
    return await runTool(name, args, userId, user);
  } catch (error) {
    if (error instanceof CalendarAuthError) {
      await markCalendarDisconnected(userId);
      return echoOutcome(CALENDAR_RECONNECT_MESSAGE);
    }
    throw error;
  }
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  user: UserContext
): Promise<ToolOutcome> {
  switch (name) {
    case "create_item": {
      const title = requireStr(args, "title");
      if (!title) return echoOutcome("I need a title to create that.");
      const categoryName = requireStr(args, "category");
      const cats = await listCategories(userId);
      let cat = categoryName
        ? cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())
        : cats[0];
      // A category the user doesn't have is refused rather than swapped for whichever sorts
      // first: the model never learns the match failed, so it can't correct itself or ask.
      if (!cat && categoryName && cats.length > 0) {
        return refuse(
          `I don't have a category called "${esc(categoryName)}". You have: ${cats.map((c) => esc(c.name)).join(", ")}. Pick one, or create it with create_category.`
        );
      }
      if (!cat) {
        cat = await createCategory({ userId, name: "General", color: "#4A6FA5", sortOrder: 0 });
      }

      let dueDate: string | null = null;
      if (args.due_date != null) {
        dueDate = normalizeDueDate(args.due_date, user.timezone);
        if (!dueDate) return refuse("I couldn't understand that due date — could you give it as a plain date, like 2026-08-25?");
      }
      let dueTime: string | null = null;
      if (args.due_time != null) {
        dueTime = normalizeDueTime(args.due_time);
        if (!dueTime) return refuse("I couldn't understand that due time — could you give it as a 24-hour time, like 14:30?");
      }

      const remindAt = args.remind_at ? parseInTz(args.remind_at as string, user.timezone) : null;
      let recurrenceRule: string | null = null;
      let recurrenceEnd: Date | null = null;
      let recurring: RecurringType = (args.recurring as RecurringType) ?? "none";
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        // Anchored to the reminder, or failing that the due date: a rule with no DTSTART gets
        // re-anchored to every new occurrence, so a COUNT-bounded run never stops.
        recurrenceRule = paramsToRRule(params, remindAt ?? (dueDate ? dueDateAnchor(dueDate) : undefined));
        if (params.until) recurrenceEnd = parseInTz(params.until, user.timezone);
        recurring = legacyRecurring(params.frequency);
      }

      const item = await createItem({
        userId,
        categoryId: cat.id,
        title,
        description: (args.description as string) ?? null,
        priority: (args.priority as Priority) ?? "medium",
        dueDate,
        dueTime,
        remindAt,
        recurring,
        recurrenceRule,
        recurrenceEnd,
      });

      const label = item.remindAt ? "Reminder" : "Task";
      const where = esc(cat.name);
      const when = item.remindAt
        ? ` — ${formatDateInTz(item.remindAt, user.timezone)} ${formatHHmmInTz(item.remindAt, user.timezone)}`
        : item.dueDate
        ? ` — due ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ""}`
        : "";
      const text = `Created ${label}: ${b(item.title)} in ${where}${when}`;

      return echoOutcome(text, {
        kind: "create_item",
        summary: `created ${b(item.title)}`,
        inverse: { op: "delete_item", itemId: item.id },
      });
    }

    case "list_items": {
      let categoryId: string | undefined;
      const categoryName = requireStr(args, "category");
      if (categoryName) {
        const cats = await listCategories(userId);
        const cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
        if (cat) categoryId = cat.id;
      }
      const requested = requireStr(args, "status");
      const status =
        requested && (["pending", "in_progress", "done"] as string[]).includes(requested)
          ? (requested as ItemStatus)
          : undefined;

      const items = await listItems(userId, {
        status,
        categoryId,
      });
      if (items.length === 0) return readOutcome("No items found.");

      // Same renderer `/list` uses: this and the slash command answer the same question, and
      // when they each owned a copy of the format they drifted — and both inherited
      // `listItems`' priority ordering, which is not the order anyone asks "what's due" in.
      const { text, itemIds } = renderFlatList(items, user.timezone, { showStatus: true });
      return readOutcome(text, itemIds);
    }

    case "complete_item": {
      const title = requireStr(args, "title");
      if (!title) return missing("title");
      const open = await listItems(userId, { status: OPEN_STATUSES });
      const resolved = resolveItem(
        open,
        args,
        title,
        "complete_item",
        "complete",
        `Couldn't find an open item matching "${esc(title)}"`
      );
      if (resolved.kind === "stop") return resolved.outcome;
      const item = resolved.item;

      await updateItem(item.id, userId, { status: "done" as ItemStatus });
      return echoOutcome(`Completed: ${b(item.title)}`, {
        kind: "complete_item",
        summary: `completed ${b(item.title)}`,
        inverse: { op: "restore_item", itemId: item.id, fields: { status: item.status } },
      });
    }

    case "delete_item": {
      const title = requireStr(args, "title");
      if (!title) return missing("title");
      const items = await listItems(userId);
      const resolved = resolveItem(
        items,
        args,
        title,
        "delete_item",
        "delete",
        `Couldn't find an item matching "${esc(title)}"`
      );
      if (resolved.kind === "stop") return resolved.outcome;
      const item = resolved.item;

      if (asScope(args.scope) === "series" && (item.seriesId || item.recurrenceRule)) {
        const seriesId = item.seriesId ?? item.id;
        const members = await listSeries(seriesId, userId);
        // Every member's Google event has to go too — dropping only the rows leaves each one
        // orphaned on the calendar with nothing left pointing at it.
        for (const member of members) {
          await deleteLinkedEvent(user, member.googleEventId, "delete_item");
        }
        const removed = await deleteSeries(seriesId, userId);
        return echoOutcome(`Deleted all ${removed} occurrences of ${b(item.title)}`, {
          kind: "delete_series",
          summary: `deleted every ${b(item.title)}`,
          inverse: {
            op: "sequence",
            ops: members.map((member) => ({
              op: "recreate_item" as const,
              itemId: member.id,
              data: { ...snapshot(member), googleEventId: null },
            })),
          },
        });
      }

      await deleteLinkedEvent(user, item.googleEventId, "delete_item");

      await deleteItem(item.id, userId);

      // The Google event is gone for good — undo restores the task, not the calendar entry,
      // because a recreated event would carry a new id the old row could not point at.
      return echoOutcome(`Deleted: ${b(item.title)}`, {
        kind: "delete_item",
        summary: `deleted ${b(item.title)}`,
        inverse: {
          op: "recreate_item",
          itemId: item.id,
          data: { ...snapshot(item), googleEventId: null },
        },
      });
    }

    case "update_item": {
      const query = requireStr(args, "query");
      if (!query) return missing("task name");
      const open = await listItems(userId, { status: OPEN_STATUSES });
      const resolved = resolveItem(
        open,
        args,
        query,
        "update_item",
        "update",
        `Couldn't find an open item matching "${esc(query)}". Try a different title.`
      );
      if (resolved.kind === "stop") return resolved.outcome;
      const item = resolved.item;
      const before = snapshot(item);
      const scope = asScope(args.scope);

      if (args.skip_next === true) return skipNextOccurrence(item, userId);


      const updates: {
        title?: string;
        dueDate?: string | null;
        dueTime?: string | null;
        remindAt?: Date | null;
        priority?: Priority;
        status?: ItemStatus;
        recurring?: RecurringType;
        recurrenceRule?: string | null;
        recurrenceEnd?: Date | null;
      } = {};
      if (args.title !== undefined) updates.title = args.title as string;
      if (args.due_date !== undefined) {
        if (args.due_date === null) {
          updates.dueDate = null;
        } else {
          const normalized = normalizeDueDate(args.due_date, user.timezone);
          if (!normalized) return refuse("I couldn't understand that due date — could you give it as a plain date, like 2026-08-25?");
          updates.dueDate = normalized;
        }
      }
      if (args.due_time !== undefined) {
        if (args.due_time === null) {
          updates.dueTime = null;
        } else {
          const normalized = normalizeDueTime(args.due_time);
          if (!normalized) return refuse("I couldn't understand that due time — could you give it as a 24-hour time, like 14:30?");
          updates.dueTime = normalized;
        }
      }
      if (args.remind_at !== undefined) {
        updates.remindAt = args.remind_at ? parseInTz(args.remind_at as string, user.timezone) : null;
      }
      if (args.priority !== undefined) updates.priority = args.priority as Priority;
      if (args.status !== undefined) updates.status = args.status as ItemStatus;
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        const due = updates.dueDate !== undefined ? updates.dueDate : item.dueDate;
        const anchor = updates.remindAt ?? item.remindAt ?? (due ? dueDateAnchor(due) : undefined);
        updates.recurrenceRule = paramsToRRule(params, anchor);
        updates.recurrenceEnd = params.until ? parseInTz(params.until, user.timezone) : null;
        updates.recurring = legacyRecurring(params.frequency);
      }
      if (args.clear_recurrence) {
        updates.recurrenceRule = null;
        updates.recurrenceEnd = null;
        updates.recurring = "none";
      }

      if (scope === "series" && (item.seriesId || item.recurrenceRule)) {
        const seriesId = item.seriesId ?? item.id;
        // `members` is the run as it was *before* the change: what the undo restores, and what
        // each linked Google event has to be moved from.
        const members = await updateSeries(seriesId, userId, updates);
        const ops: UndoOp[] = [];
        for (const member of members) {
          const pushed = await syncLinkedEvent(user, member, updates);
          ops.push({ op: "restore_item", itemId: member.id, fields: snapshot(member) });
          const patch = inverseEventPatch(user, member, pushed);
          if (patch) ops.push(patch);
        }
        return echoOutcome(`Updated all ${members.length} occurrences of ${b(item.title)}`, {
          kind: "update_series",
          summary: `the change to every ${b(item.title)}`,
          inverse: { op: "sequence", ops },
        });
      }

      const updated = await updateItem(item.id, userId, updates);
      const pushed = await syncLinkedEvent(user, item, updates);

      const restore: UndoOp = { op: "restore_item", itemId: item.id, fields: before };
      const patch = inverseEventPatch(user, item, pushed);
      return echoOutcome(`Updated: ${b(updated.title)}`, {
        kind: "update_item",
        summary: `the change to ${b(item.title)}`,
        inverse: patch ? { op: "sequence", ops: [restore, patch] } : restore,
      });
    }

    case "get_calendar": {
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Settings.");
      const startDate = requireStr(args, "start_date");
      const endDate = requireStr(args, "end_date");
      if (!startDate || !endDate) return missing("date range");
      const rangeStart = parseInTz(startDate, user.timezone);
      const rangeEnd = parseInTz(endDate, user.timezone);
      if (!rangeStart || !rangeEnd) return refuse("I couldn't understand that date range.");
      if (rangeEnd <= rangeStart) return refuse("That date range ends before it starts — could you rephrase it?");

      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        rangeStart,
        rangeEnd,
        user.timezone
      );
      if (events.length === 0) return readOutcome("No events in that time range.");
      return readOutcome(
        events
          .map((e) =>
            `- ${esc(e.title)} (${e.allDay ? `${e.startTime}, all day` : esc(e.startTime.replace("T", " ").slice(0, 16))})`
          )
          .join("\n")
      );
    }

    case "create_calendar_event": {
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Settings.");

      const title = requireStr(args, "title");
      const startTime = requireStr(args, "start_time");
      const endTime = requireStr(args, "end_time");
      if (!title) return missing("title");
      if (!startTime || !endTime) return missing("start and end time");
      const description = (args.description as string) ?? undefined;
      const confirmConflict = args.confirm_conflict === true;

      const startInstant = parseInTz(startTime, user.timezone);
      const endInstant = parseInTz(endTime, user.timezone);
      if (!startInstant || !endInstant) return refuse("I couldn't understand the event time.");
      if (endInstant <= startInstant) return refuse("The event's end time must be after its start time.");

      if (!confirmConflict) {
        const existing = await getEvents(
          user.googleRefreshToken,
          user.googleCalendarId ?? "primary",
          startInstant,
          endInstant,
          user.timezone
        );
        const conflicts = existing.filter((e) => !e.allDay && e.transparency !== "transparent");

        if (conflicts.length > 0) {
          const conflictLines = conflicts
            .map((e) => `• ${esc(e.title)} (${e.startTime.slice(11, 16)}–${e.endTime.slice(11, 16)})`)
            .join("\n");
          return {
            text: `Conflict detected — you already have:\n${conflictLines}\n\nStill want me to book ${b(title)} then? Say "yes" and I'll add it anyway.`,
            echo: true,
            failed: true,
          };
        }
      }

      let recurrence: string[] | undefined;
      if (args.recurrence) {
        recurrence = [paramsToRRule(args.recurrence as RecurrenceParams)];
      }

      const calendarId = user.googleCalendarId ?? "primary";
      const event = await createEvent(
        user.googleRefreshToken,
        calendarId,
        { title, startTime, endTime, description, recurrence },
        user.timezone
      );

      await writeThroughEvent(userId, calendarId, event, "create_calendar_event");

      const warnings: string[] = [];
      const eventDate = formatDateInTz(startInstant, user.timezone);
      const items = await listItems(userId, { status: "pending" as ItemStatus });
      const sameDayTasks = items.filter((item) => item.dueDate === eventDate && !item.googleEventId);
      if (sameDayTasks.length > 0) {
        const taskList = sameDayTasks
          .slice(0, 3)
          .map((t) => `• ${esc(t.title)}${t.dueTime ? ` (due ${t.dueTime})` : ""}`)
          .join("\n");
        warnings.push(
          `Heads up — you have ${sameDayTasks.length} task${sameDayTasks.length > 1 ? "s" : ""} due that day:\n${taskList}`
        );
      }

      const whenLabel = `${formatDateInTz(startInstant, user.timezone)} ${formatHHmmInTz(startInstant, user.timezone)}–${formatHHmmInTz(endInstant, user.timezone)}`;
      let text = `Created calendar event: ${b(event.title)} (${whenLabel})${confirmConflict ? " — added despite the overlap" : ""}`;
      if (warnings.length > 0) text += `\n\n⚠️ ${warnings.join("\n\n")}`;

      return echoOutcome(text, {
        kind: "create_calendar_event",
        summary: `created ${b(event.title)} on your calendar`,
        inverse: { op: "delete_event", calendarId, eventId: event.id },
      });
    }

    case "create_category": {
      const name = requireStr(args, "name");
      if (!name) return missing("name");
      const cat = await createCategory({ userId, name, color: (args.color as string) ?? null });
      return echoOutcome(`Created category: ${b(cat.name)}`, {
        kind: "create_category",
        summary: `created the ${b(cat.name)} category`,
        inverse: { op: "delete_category", categoryId: cat.id },
      });
    }

    case "list_categories": {
      const cats = await listCategories(userId);
      if (cats.length === 0) return readOutcome("No categories yet.");
      return readOutcome(cats.map((c) => `- ${esc(c.name)}`).join("\n"));
    }

    case "update_calendar_event": {
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Settings.");

      const queryRaw = requireStr(args, "query");
      if (!queryRaw) return missing("event name");
      const query = queryRaw.toLowerCase();
      const calendarId = user.googleCalendarId ?? "primary";

      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
      if (args.title !== undefined) gcalFields.title = args.title as string;
      if (args.description !== undefined) gcalFields.description = args.description as string;
      if (args.start_time !== undefined) gcalFields.startTime = args.start_time as string;
      if (args.end_time !== undefined) gcalFields.endTime = args.end_time as string;
      if (args.recurrence) {
        (gcalFields as Record<string, unknown>).recurrence = [paramsToRRule(args.recurrence as RecurrenceParams)];
      }
      if (args.clear_recurrence) {
        (gcalFields as Record<string, unknown>).recurrence = null;
      }

      const items = await listItems(userId);
      const linked = items.find((item) => fuzzyMatch(item.title, query) && item.googleEventId);

      if (linked) {
        const before = snapshot(linked);
        const updates: { title?: string; dueDate?: string | null; dueTime?: string | null; description?: string | null } = {};
        if (args.title !== undefined) updates.title = args.title as string;
        if (args.description !== undefined) updates.description = args.description as string;
        if (args.start_time !== undefined) {
          const startDate = parseInTz(args.start_time as string, user.timezone);
          if (startDate) {
            updates.dueDate = formatDateInTz(startDate, user.timezone);
            updates.dueTime = formatHHmmInTz(startDate, user.timezone);
          }
        }
        // What the event looked like before, read off the item it mirrors — a database-only
        // inverse would undo the row and leave the event sitting at its new time.
        const priorEvent: Partial<EventSnapshot> = {};
        if (gcalFields.title !== undefined) priorEvent.title = linked.title;
        // "" rather than omitted: undoing a description the call *added* has to clear it.
        if (gcalFields.description !== undefined) priorEvent.description = linked.description ?? "";
        if ((gcalFields.startTime !== undefined || gcalFields.endTime !== undefined) && linked.dueDate && linked.dueTime) {
          Object.assign(priorEvent, dueWindowToGcal(linked.dueDate, linked.dueTime));
        }

        await updateItem(linked.id, userId, updates);
        try {
          const updated = await updateEvent(user.googleRefreshToken, calendarId, linked.googleEventId!, gcalFields, user.timezone);
          await writeThroughEvent(userId, calendarId, updated, "update_calendar_event");
        } catch (error) {
          if (error instanceof CalendarAuthError) throw error;
          return echoOutcome(`Updated in-app event: ${b(args.title ?? linked.title)} (Google Calendar sync failed)`);
        }
        const restore: UndoOp = { op: "restore_item", itemId: linked.id, fields: before };
        return echoOutcome(`Updated calendar event: ${b(args.title ?? linked.title)}`, {
          kind: "update_calendar_event",
          summary: `the change to ${b(linked.title)}`,
          inverse:
            Object.keys(priorEvent).length > 0
              ? {
                  op: "sequence",
                  ops: [restore, { op: "patch_event", calendarId, eventId: linked.googleEventId!, fields: priorEvent }],
                }
              : restore,
        });
      }

      const now = new Date();
      const searchEnd = new Date(now.getTime() + 90 * 86400000);
      const events = await getEvents(user.googleRefreshToken, calendarId, now, searchEnd, user.timezone);
      const gcalMatch = events.find((e) => fuzzyMatch(e.title, query));
      if (!gcalMatch) return refuse(`Couldn't find a calendar event matching "${esc(queryRaw)}"`);

      const previous: UndoOp = {
        op: "patch_event",
        calendarId,
        eventId: gcalMatch.id,
        fields: {
          title: gcalMatch.title,
          startTime: gcalMatch.startTime,
          endTime: gcalMatch.endTime,
          // The forward call can rewrite the description, so the inverse has to carry it —
          // and "" rather than omitted, so undoing one the call *added* clears it.
          description: gcalMatch.description ?? "",
        },
      };

      try {
        const updated = await updateEvent(user.googleRefreshToken, calendarId, gcalMatch.id, gcalFields, user.timezone);
        await writeThroughEvent(userId, calendarId, updated, "update_calendar_event");
      } catch (error) {
        if (error instanceof CalendarAuthError) throw error;
        return refuse(`Found "${esc(gcalMatch.title)}" but failed to update it in Google Calendar.`);
      }
      return echoOutcome(`Updated calendar event: ${b(args.title ?? gcalMatch.title)}`, {
        kind: "update_calendar_event",
        summary: `the change to ${b(gcalMatch.title)}`,
        inverse: previous,
      });
    }

    case "delete_calendar_event": {
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Settings.");

      const queryRaw = requireStr(args, "query");
      if (!queryRaw) return missing("event name");
      const query = queryRaw.toLowerCase();
      const calendarId = user.googleCalendarId ?? "primary";

      const items = await listItems(userId);
      const linked = items.find((item) => fuzzyMatch(item.title, query) && item.googleEventId);

      if (linked) {
        const before = snapshot(linked);
        let event: { title: string; startTime: string; endTime: string; description?: string } | null = null;
        try {
          const window = await getEvents(
            user.googleRefreshToken,
            calendarId,
            new Date(Date.now() - 86400000),
            new Date(Date.now() + 90 * 86400000),
            user.timezone
          );
          const found = window.find((e) => e.id === linked.googleEventId);
          if (found) {
            event = {
              title: found.title,
              startTime: found.startTime,
              endTime: found.endTime,
              ...(found.description ? { description: found.description } : {}),
            };
          }
          await deleteEvent(user.googleRefreshToken, calendarId, linked.googleEventId!);
          await writeThroughDelete(userId, linked.googleEventId!, "delete_calendar_event");
        } catch (error) {
          if (error instanceof CalendarAuthError) throw error;
          console.error("[tool:delete_calendar_event] calendar delete failed:", error instanceof Error ? error.message : error);
        }

        await deleteItem(linked.id, userId);

        return echoOutcome(`Deleted calendar event: ${b(linked.title)}`, {
          kind: "delete_calendar_event",
          summary: `deleted ${b(linked.title)}`,
          inverse: event
            ? {
                op: "recreate_event",
                calendarId,
                event,
                item: { ...before, id: linked.id, title: linked.title, categoryId: linked.categoryId },
              }
            : { op: "recreate_item", itemId: linked.id, data: { ...before, googleEventId: null } },
        });
      }

      const now = new Date();
      const searchEnd = new Date(now.getTime() + 90 * 86400000);
      const events = await getEvents(user.googleRefreshToken, calendarId, now, searchEnd, user.timezone);
      const gcalMatch = events.find((e) => fuzzyMatch(e.title, query));
      if (!gcalMatch) return refuse(`Couldn't find a calendar event matching "${esc(queryRaw)}"`);

      try {
        await deleteEvent(user.googleRefreshToken, calendarId, gcalMatch.id);
        await writeThroughDelete(userId, gcalMatch.id, "delete_calendar_event");
      } catch (error) {
        if (error instanceof CalendarAuthError) throw error;
        return refuse(`Found "${esc(gcalMatch.title)}" but failed to delete it from Google Calendar.`);
      }

      return echoOutcome(`Deleted calendar event: ${b(gcalMatch.title)}`, {
        kind: "delete_calendar_event",
        summary: `deleted ${b(gcalMatch.title)}`,
        inverse: {
          op: "recreate_event",
          calendarId,
          event: {
            title: gcalMatch.title,
            startTime: gcalMatch.startTime,
            endTime: gcalMatch.endTime,
            ...(gcalMatch.description ? { description: gcalMatch.description } : {}),
          },
        },
      });
    }

    case "suggest_schedule": {
      const pending = await listItems(userId, { status: "pending" as ItemStatus });
      if (pending.length === 0) return readOutcome("No pending tasks to schedule.");

      const now = new Date();
      let startStr = todayInTz(user.timezone, now);
      if (args.date != null) {
        const requested = normalizeDueDate(args.date, user.timezone);
        if (!requested) return refuse("I couldn't understand that date — could you give it as a plain date, like 2026-08-25?");
        startStr = requested;
      }
      const today = startOfDayInTz(startStr, user.timezone);
      const sevenDaysOut = new Date(today.getTime() + 7 * 86400000);
      // Today's window starts *now* so slots already gone aren't offered; a future week starts
      // at its own midnight, which is the whole point of asking for one.
      const windowStart = today > now ? today : now;

      const taskLines = pending
        .slice(0, 10)
        .map((item) => `- ${esc(item.title)} (priority: ${item.priority}${item.dueDate ? `, due: ${item.dueDate}` : ""})`)
        .join("\n");

      if (!user.googleRefreshToken) {
        return readOutcome(
          `Here are your pending tasks — connect Google Calendar in Settings for time-slot suggestions:\n\n${taskLines}`,
          pending.slice(0, 10).map((item) => item.id)
        );
      }

      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        windowStart,
        sevenDaysOut,
        user.timezone
      );

      const workStart = 9 * 60;
      const workEnd = 18 * 60;
      const freeBlocks: string[] = [];
      const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

      const busy = events
        .filter((e) => !e.allDay && e.transparency !== "transparent")
        .map((e) => {
          const start = new Date(e.startTime);
          const end = new Date(e.endTime);
          return {
            date: formatDateInTz(start, user.timezone),
            startMin: toMinutesOfDay(start, user.timezone),
            endMin: toMinutesOfDay(end, user.timezone),
          };
        });

      for (let d = 0; d < 7; d++) {
        const day = new Date(today.getTime() + d * 86400000);
        const dateStr = formatDateInTz(day, user.timezone);
        const dayEvents = busy.filter((e) => e.date === dateStr).sort((a, z) => a.startMin - z.startMin);

        let cursor = workStart;
        for (const ev of dayEvents) {
          if (cursor < ev.startMin) freeBlocks.push(`${dateStr} ${fmt(cursor)}–${fmt(ev.startMin)}`);
          cursor = Math.max(cursor, ev.endMin);
        }
        if (cursor < workEnd) freeBlocks.push(`${dateStr} ${fmt(cursor)}–${fmt(workEnd)}`);
      }

      const freeLines = freeBlocks.slice(0, 8).join(", ") || "No free blocks found in working hours (9am–6pm)";
      return readOutcome(
        `Pending tasks:\n${taskLines}\n\nFree blocks in the 7 days from ${startStr} (09:00–18:00):\n${freeLines}`,
        pending.slice(0, 10).map((item) => item.id)
      );
    }

    case "decompose_task": {
      const parentTitle = requireStr(args, "parent_title");
      if (!parentTitle) return missing("task name");
      const open = await listItems(userId, { status: OPEN_STATUSES });
      const resolved = resolveItem(
        open,
        args,
        parentTitle,
        "decompose_task",
        "break down",
        `Couldn't find an open task matching "${esc(parentTitle)}"`
      );
      if (resolved.kind === "stop") return resolved.outcome;
      const parent = resolved.item;

      const subtasks = Array.isArray(args.subtasks)
        ? (args.subtasks as Array<{ title?: unknown; priority?: unknown }>)
        : [];
      const valid = subtasks.filter((sub): sub is { title: string; priority?: string } => typeof sub?.title === "string" && sub.title.trim().length > 0);
      if (valid.length === 0) return refuse("I need a list of subtasks to break that down.");

      const created: Array<{ id: string; title: string }> = [];
      for (const sub of valid) {
        const child = await createItem({
          userId,
          categoryId: parent.categoryId,
          title: sub.title.trim(),
          priority: (sub.priority as Priority) ?? parent.priority,
          parentId: parent.id,
        });
        created.push({ id: child.id, title: child.title });
      }

      return echoOutcome(
        `Decomposed ${b(parent.title)} into ${created.length} subtasks:\n${created.map((t) => `• ${esc(t.title)}`).join("\n")}`,
        {
          kind: "decompose_task",
          summary: `breaking ${b(parent.title)} into ${created.length} subtasks`,
          inverse: { op: "sequence", ops: created.map((t) => ({ op: "delete_item" as const, itemId: t.id })) },
        }
      );
    }

    case "search_items": {
      const query = requireStr(args, "query");
      if (!query) return missing("search term");
      const results = await searchItems(userId, query);
      if (results.length === 0) return readOutcome(`No items matching "${esc(query)}"`);
      const lines = results.map((r, i) => {
        const icon = r.type === "reminder" ? "🔔" : "📋";
        const status = r.status === "done" ? "✓" : r.status === "in_progress" ? "⟳" : "○";
        return `${i + 1}. ${icon} ${status} ${esc(r.title)}${r.dueDate ? ` (${r.dueDate})` : ""} — ${esc(r.category.name)}`;
      });
      return readOutcome(lines.join("\n"), results.map((r) => r.id));
    }

    default:
      // Told to the model, not the user: a tool it invented is an internal slip, and a null
      // text reaches the model as "Done." — it would then build on work that never happened.
      return { text: `Error: no tool named ${name}`, echo: false, failed: true };
  }
}

/**
 * "Skip this week" — move a repeating item on by one occurrence without completing it and
 * without spawning the next copy, which is what completing it would do.
 */
async function skipNextOccurrence(item: ItemRow, userId: string): Promise<ToolOutcome> {
  const rule = item.recurrenceRule || LEGACY_RRULES[item.recurring];
  if (!rule) return refuse(`${b(item.title)} doesn't repeat, so there's nothing to skip.`);

  if (item.remindAt) {
    const next = getNextOccurrence(rule, item.remindAt);
    if (!next) return refuse(`${b(item.title)} has no occurrence after this one.`);
    await updateItem(item.id, userId, { remindAt: next });
    return echoOutcome(`Skipped — next ${b(item.title)} is ${next.toISOString().slice(0, 10)}`, {
      kind: "skip_occurrence",
      summary: `skipping ${b(item.title)}`,
      inverse: { op: "restore_item", itemId: item.id, fields: { remindAt: item.remindAt.toISOString() } },
    });
  }

  if (!item.dueDate) return refuse(`${b(item.title)} has no date to move.`);
  const next = nextDueDate(item.dueDate, rule);
  if (!next) return refuse(`${b(item.title)} has no occurrence after this one.`);
  await updateItem(item.id, userId, { dueDate: next });
  return echoOutcome(`Skipped — next ${b(item.title)} is due ${next}`, {
    kind: "skip_occurrence",
    summary: `skipping ${b(item.title)}`,
    inverse: { op: "restore_item", itemId: item.id, fields: { dueDate: item.dueDate } },
  });
}

const LEGACY_RRULES: Record<string, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

function toMinutesOfDay(date: Date, tz: string): number {
  const [h, m] = formatHHmmInTz(date, tz).split(":").map(Number);
  return h * 60 + m;
}
