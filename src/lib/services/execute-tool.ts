import {
  createItem,
  listItems,
  updateItem,
  deleteItem,
  updateSeries,
  deleteSeries,
  listSeries,
  nextDueDate,
  getItem,
  OPEN_STATUSES,
} from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { getEvents, createEvent, updateEvent, deleteEvent, CalendarAuthError, type CalendarEvent } from "@/lib/services/calendar";
import { mirrorEvent, unmirrorEvent } from "@/lib/services/calendar-sync";
import { markCalendarDisconnected, CALENDAR_RECONNECT_MESSAGE } from "@/lib/services/calendar-link";
import { searchItems } from "@/lib/services/search";
import { paramsToRRule, getNextOccurrence, dueDateAnchor, reanchorRule, type RecurrenceParams } from "@/lib/services/recurrence";
import { matchByTitle } from "@/lib/services/match-items";
import { renderFlatList } from "@/lib/services/commands/format";
import { esc, b } from "@/lib/services/telegram";
import { parseInTz, formatDateInTz, formatHHmmInTz, toRfc3339InTz } from "@/lib/tz";
import { normalizeDueDate, normalizeDueTime } from "@/lib/due-format";
import { readOutcome, echoOutcome, completionRecord, type ToolOutcome, type ItemSnapshot, type UndoOp } from "@/lib/services/tool-outcome";
import type { Priority, ItemStatus } from "@/generated/prisma/enums";

const PAST_REMIND_AT = "That time has already passed today — did you mean tomorrow?";
const isPast = (at: Date) => at.getTime() < Date.now() - 60_000;

const BAD_REMIND_AT =
  "I couldn't understand that reminder time — could you give it as a date and time, like 2026-08-25T09:00?";

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
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
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
    recurrenceRule: item.recurrenceRule,
    recurrenceEnd: item.recurrenceEnd ? item.recurrenceEnd.toISOString() : null,
    parentId: item.parentId,
    notificationStage: item.notificationStage,
    // Without this an undone occurrence comes back detached from its run, and no tool can
    // re-attach it — "delete the whole series" would then miss the row it just restored.
    seriesId: item.seriesId,
  };
}

type GcalFields = { title?: string; startTime?: string; endTime?: string; description?: string };

/**
 * Fill in the end Google needs when a patch moves only the start. Google keeps the stored `end`
 * on a partial patch, so "shift my dinner to next week" would otherwise ask for an empty range
 * (a 400). Carries the event's current duration onto the new start.
 */
function preserveEventDuration(
  fields: GcalFields,
  current: { startTime: string; endTime: string },
  tz: string
): void {
  if (fields.startTime === undefined || fields.endTime !== undefined) return;

  const newStart = parseInTz(fields.startTime, tz);
  const prevStart = parseInTz(current.startTime, tz);
  const prevEnd = parseInTz(current.endTime, tz);
  if (!newStart || !prevStart || !prevEnd) return;

  const durationMs = prevEnd.getTime() - prevStart.getTime();
  if (durationMs <= 0) return;
  fields.endTime = new Date(newStart.getTime() + durationMs).toISOString();
}

type Resolution<T> = { kind: "one"; item: T } | { kind: "stop"; outcome: ToolOutcome };

/**
 * Which item did the user mean?
 *
 * Picking the first of several silently completed and deleted the wrong task, so an
 * ambiguous title is returned as a set of candidates for the caller to turn into buttons
 * rather than resolved by guesswork.
 */
async function resolveItem(
  userId: string,
  args: Record<string, unknown>,
  query: string,
  { tool, verb, notFound, tz, closedToo = false }: { tool: string; verb: string; notFound: string; tz: string; closedToo?: boolean }
): Promise<Resolution<ItemRow>> {
  // A forced id (a choice button, or the message being replied to) names one exact row, and
  // may name a closed one: "move it to Friday" in reply to a reminder that already rang.
  const forced = typeof args[FORCED_ITEM_ID] === "string" ? (args[FORCED_ITEM_ID] as string) : null;
  if (forced) {
    const item = await getItem(forced, userId);
    return item ? { kind: "one", item } : { kind: "stop", outcome: echoOutcome("That item no longer exists.") };
  }

  // Open tasks and their open subtasks; deleting falls back to closed ones, so "delete the
  // dentist task" still works after it was ticked off.
  const pool = async (status?: typeof OPEN_STATUSES) => {
    const top = await listItems(userId, status ? { status } : {});
    return [...top, ...top.flatMap((item) => item.subtasks.filter((sub) => !status || sub.status !== "done"))];
  };
  let match = matchByTitle(await pool(OPEN_STATUSES), query);
  if (match.kind === "none" && closedToo) match = matchByTitle(await pool(), query);
  if (match.kind === "none") return { kind: "stop", outcome: refuse(notFound) };
  if (match.kind === "one") return { kind: "one", item: match.item };

  // Repeats share a title, so each button carries its date to be told apart.
  const label = (item: ItemRow) => {
    const when = item.dueDate ?? (item.remindAt ? formatDateInTz(item.remindAt, tz) : null);
    return when ? `${item.title} · ${when}` : item.title;
  };
  return {
    kind: "stop",
    outcome: {
      text: `That matches ${match.items.length} items — which one should I ${verb}?`,
      echo: true,
      choose: {
        tool,
        args,
        candidates: match.items.slice(0, 5).map((item) => ({ id: item.id, title: label(item) })),
      },
    },
  };
}

/**
 * Which upcoming Google event the user meant. Repeats of one title are expected (a series
 * comes back expanded), so those act on the next occurrence; different titles are refused so
 * the model asks instead of guessing — the same rule `resolveItem` applies to tasks.
 */
async function resolveEvent(
  refreshToken: string,
  calendarId: string,
  query: string,
  tz: string
): Promise<Resolution<CalendarEvent>> {
  const now = new Date();
  const events = await getEvents(refreshToken, calendarId, now, new Date(now.getTime() + 90 * 86400000), tz);
  const match = matchByTitle(events, query);
  if (match.kind === "none") return { kind: "stop", outcome: refuse(`Couldn't find a calendar event matching "${esc(query)}"`) };
  if (match.kind === "one") return { kind: "one", item: match.item };
  const titles = [...new Set(match.items.map((e) => e.title))];
  if (titles.length === 1) return { kind: "one", item: match.items[0] };
  return {
    kind: "stop",
    outcome: refuse(`"${esc(query)}" matches ${titles.length} different events: ${titles.slice(0, 5).map(esc).join(", ")}. Which one?`),
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
          `I don't have a category called "${esc(categoryName)}". You have: ${cats.map((c) => esc(c.name)).join(", ")}. Use one of those unless the user asked for a new one.`
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

      // Unreadable is refused, not dropped: dropping it made a plain task and reported success.
      const remindAt = args.remind_at ? parseInTz(String(args.remind_at), user.timezone) : null;
      if (args.remind_at && !remindAt) return refuse(BAD_REMIND_AT);
      if (remindAt && isPast(remindAt)) return refuse(PAST_REMIND_AT);
      let recurrenceRule: string | null = null;
      let recurrenceEnd: Date | null = null;
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        // Anchored to the reminder, or failing that the due date: a rule with no DTSTART gets
        // re-anchored to every new occurrence, so a COUNT-bounded run never stops.
        recurrenceRule = paramsToRRule(params, remindAt ?? (dueDate ? dueDateAnchor(dueDate) : undefined));
        if (params.until) recurrenceEnd = parseInTz(params.until, user.timezone);
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
        if (!cat) return refuse(`There's no category called "${esc(categoryName)}". The user has: ${cats.map((c) => esc(c.name)).join(", ")}.`);
        categoryId = cat.id;
      }
      // Open by default: every rung of a daily reminder is a done row, so "what's on my list"
      // otherwise fed the model hundreds of them.
      const requested = requireStr(args, "status");
      const status =
        requested && (["pending", "in_progress", "done"] as string[]).includes(requested)
          ? (requested as ItemStatus)
          : OPEN_STATUSES;

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
      const resolved = await resolveItem(userId, args, title, {
        tool: "complete_item",
        verb: "complete",
        notFound: `Couldn't find an open item matching "${esc(title)}"`,
        tz: user.timezone,
      });
      if (resolved.kind === "stop") return resolved.outcome;
      const item = resolved.item;
      if (item.status === "done") return echoOutcome(`${b(item.title)} is already done.`);

      await updateItem(item.id, userId, { status: "done" as ItemStatus });
      return echoOutcome(`Completed: ${b(item.title)}`, completionRecord(item));
    }

    case "delete_item": {
      const title = requireStr(args, "title");
      if (!title) return missing("title");
      const resolved = await resolveItem(userId, args, title, {
        tool: "delete_item",
        verb: "delete",
        notFound: `Couldn't find an item matching "${esc(title)}"`,
        tz: user.timezone,
        closedToo: true,
      });
      if (resolved.kind === "stop") return resolved.outcome;
      const item = resolved.item;

      if (asScope(args.scope) === "series" && (item.seriesId || item.recurrenceRule)) {
        const seriesId = item.seriesId ?? item.id;
        const members = await listSeries(seriesId, userId);
        const removed = await deleteSeries(seriesId, userId);
        return echoOutcome(`Deleted all ${removed} occurrences of ${b(item.title)}`, {
          kind: "delete_series",
          summary: `deleted every ${b(item.title)}`,
          inverse: {
            op: "sequence",
            ops: members.map((member) => ({ op: "recreate_item" as const, itemId: member.id, data: snapshot(member) })),
          },
        });
      }

      await deleteItem(item.id, userId);
      return echoOutcome(`Deleted: ${b(item.title)}`, {
        kind: "delete_item",
        summary: `deleted ${b(item.title)}`,
        inverse: { op: "recreate_item", itemId: item.id, data: snapshot(item) },
      });
    }

    case "update_item": {
      const query = requireStr(args, "query");
      if (!query) return missing("task name");
      const resolved = await resolveItem(userId, args, query, {
        tool: "update_item",
        verb: "update",
        notFound: `Couldn't find an open item matching "${esc(query)}". Try a different title.`,
        tz: user.timezone,
      });
      if (resolved.kind === "stop") return resolved.outcome;
      const item = resolved.item;
      const before = snapshot(item);
      const scope = asScope(args.scope);

      if (args.skip_next === true) return skipNextOccurrence(item, userId, user.timezone);

      const updates: {
        title?: string;
        dueDate?: string | null;
        dueTime?: string | null;
        remindAt?: Date | null;
        priority?: Priority;
        status?: ItemStatus;
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
        // Unreadable is refused, not nulled: nulling it silently deleted the existing reminder.
        updates.remindAt = args.remind_at ? parseInTz(String(args.remind_at), user.timezone) : null;
        if (args.remind_at && !updates.remindAt) return refuse(BAD_REMIND_AT);
        if (updates.remindAt && isPast(updates.remindAt)) return refuse(PAST_REMIND_AT);
        // A moved repeating reminder: restart its rule at the new time, or the old start keeps
        // firing too ("move my 9am meds to 8am" rang at 8 *and* 9, then went back to 9).
        if (updates.remindAt && item.recurrenceRule && !args.recurrence) {
          updates.recurrenceRule = reanchorRule(item.recurrenceRule, updates.remindAt) ?? item.recurrenceRule;
        }
        // Re-arming a reminder that already rang (a reply "move it to Friday") reopens it.
        if (updates.remindAt && item.status === "done" && args.status === undefined) updates.status = "pending";
      }
      if (args.priority !== undefined) updates.priority = args.priority as Priority;
      if (args.status !== undefined) updates.status = args.status as ItemStatus;
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        const due = updates.dueDate !== undefined ? updates.dueDate : item.dueDate;
        const anchor = updates.remindAt ?? item.remindAt ?? (due ? dueDateAnchor(due) : undefined);
        updates.recurrenceRule = paramsToRRule(params, anchor);
        updates.recurrenceEnd = params.until ? parseInTz(params.until, user.timezone) : null;
      }
      if (args.clear_recurrence) {
        updates.recurrenceRule = null;
        updates.recurrenceEnd = null;
      }

      if (scope === "series" && (item.seriesId || item.recurrenceRule)) {
        const seriesId = item.seriesId ?? item.id;
        // `members` is the run as it was *before* the change, which is what the undo restores.
        const members = await updateSeries(seriesId, userId, updates);
        return echoOutcome(`Updated all ${members.length} occurrences of ${b(item.title)}`, {
          kind: "update_series",
          summary: `the change to every ${b(item.title)}`,
          inverse: {
            op: "sequence",
            ops: members.map((member) => ({ op: "restore_item" as const, itemId: member.id, fields: snapshot(member) })),
          },
        });
      }

      const updated = await updateItem(item.id, userId, updates);
      return echoOutcome(`Updated: ${b(updated.title)}`, {
        kind: "update_item",
        summary: `the change to ${b(item.title)}`,
        inverse: { op: "restore_item", itemId: item.id, fields: before },
      });
    }

    case "get_calendar": {
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Open Calcapone → Settings.");
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
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Open Calcapone → Settings.");

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
        // Google wants a full RFC 3339 time; the model now sends local wall-clock without one.
        { title, startTime: toRfc3339InTz(startInstant, user.timezone), endTime: toRfc3339InTz(endInstant, user.timezone), description, recurrence },
        user.timezone
      );

      await mirrorEvent(userId, calendarId, event);

      const warnings: string[] = [];
      const eventDate = formatDateInTz(startInstant, user.timezone);
      const items = await listItems(userId, { status: "pending" as ItemStatus });
      const sameDayTasks = items.filter((item) => item.dueDate === eventDate);
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

    case "update_calendar_event": {
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Open Calcapone → Settings.");

      const query = requireStr(args, "query");
      if (!query) return missing("event name");
      const calendarId = user.googleCalendarId ?? "primary";

      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
      if (args.title !== undefined) gcalFields.title = args.title as string;
      if (args.description !== undefined) gcalFields.description = args.description as string;
      for (const [arg, field] of [["start_time", "startTime"], ["end_time", "endTime"]] as const) {
        if (args[arg] === undefined) continue;
        const at = parseInTz(String(args[arg]), user.timezone);
        if (!at) return refuse("I couldn't understand the event time.");
        gcalFields[field] = toRfc3339InTz(at, user.timezone);
      }
      if (args.recurrence) {
        (gcalFields as Record<string, unknown>).recurrence = [paramsToRRule(args.recurrence as RecurrenceParams)];
      }
      if (args.clear_recurrence) {
        (gcalFields as Record<string, unknown>).recurrence = null;
      }

      const resolved = await resolveEvent(user.googleRefreshToken, calendarId, query, user.timezone);
      if (resolved.kind === "stop") return resolved.outcome;
      const gcalMatch = resolved.item;

      preserveEventDuration(gcalFields, gcalMatch, user.timezone);

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
        await mirrorEvent(userId, calendarId, updated);
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
      if (!user.googleRefreshToken) return refuse("Google Calendar not connected. Connect it in Open Calcapone → Settings.");

      const query = requireStr(args, "query");
      if (!query) return missing("event name");
      const calendarId = user.googleCalendarId ?? "primary";

      const resolved = await resolveEvent(user.googleRefreshToken, calendarId, query, user.timezone);
      if (resolved.kind === "stop") return resolved.outcome;
      const gcalMatch = resolved.item;

      try {
        await deleteEvent(user.googleRefreshToken, calendarId, gcalMatch.id);
        await unmirrorEvent(userId, gcalMatch.id);
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

    case "decompose_task": {
      const parentTitle = requireStr(args, "parent_title");
      if (!parentTitle) return missing("task name");
      const resolved = await resolveItem(userId, args, parentTitle, {
        tool: "decompose_task",
        verb: "break down",
        notFound: `Couldn't find an open task matching "${esc(parentTitle)}"`,
        tz: user.timezone,
      });
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
async function skipNextOccurrence(item: ItemRow, userId: string, tz: string): Promise<ToolOutcome> {
  const rule = item.recurrenceRule;
  if (!rule) return refuse(`${b(item.title)} doesn't repeat, so there's nothing to skip.`);

  if (item.remindAt) {
    const next = getNextOccurrence(rule, item.remindAt, undefined, tz);
    if (!next) return refuse(`${b(item.title)} has no occurrence after this one.`);
    await updateItem(item.id, userId, { remindAt: next });
    return echoOutcome(`Skipped — next ${b(item.title)} is ${formatDateInTz(next, tz)}`, {
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
