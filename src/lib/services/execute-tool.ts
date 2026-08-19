// src/lib/services/execute-tool.ts
import { createItem, listItems, updateItem, deleteItem, OPEN_STATUSES } from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { getEvents, createEvent, updateEvent, deleteEvent, CalendarAuthError } from "@/lib/services/calendar";
import { markCalendarDisconnected, CALENDAR_RECONNECT_MESSAGE } from "@/lib/services/calendar-link";
import { searchItems } from "@/lib/services/search";
import { paramsToRRule, type RecurrenceParams } from "@/lib/services/recurrence";
import { matchByTitle, type TitleMatch } from "@/lib/services/match-items";
import { dueWindowToGcal } from "@/lib/services/gcal-window";
import { esc, b } from "@/lib/services/telegram";
import { parseInTz, todayInTz, formatDateInTz, formatHHmmInTz, startOfDayInTz } from "@/lib/tz";
import { normalizeDueDate, normalizeDueTime } from "@/lib/due-format";
import type { Priority, RecurringType, ItemStatus } from "@/generated/prisma/enums";

function fuzzyMatch(title: string, query: string): boolean {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  return t.includes(q) || q.includes(t);
}

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

function missing(key: string): string {
  return `I need a ${key.replace(/_/g, " ")} for that — could you say it again with more detail?`;
}

/** Ask rather than guess when a title matches several open items. */
function ambiguous(match: Extract<TitleMatch<{ title: string }>, { kind: "many" }>, verb: string): string {
  const options = match.items.slice(0, 5).map((item) => `• ${esc(item.title)}`).join("\n");
  const more = match.items.length > 5 ? `\n…and ${match.items.length - 5} more` : "";
  return `That matches ${match.items.length} items — which one should I ${verb}?\n${options}${more}`;
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  user: { googleRefreshToken: string | null; googleCalendarId: string | null; timezone: string }
): Promise<string | null> {
  try {
    return await runTool(name, args, userId, user);
  } catch (error) {
    // A revoked Google grant can't be retried — clear it and tell the user, rather than
    // letting every calendar write silently no-op while Settings still says "Connected".
    if (error instanceof CalendarAuthError) {
      await markCalendarDisconnected(userId);
      return CALENDAR_RECONNECT_MESSAGE;
    }
    throw error;
  }
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  user: { googleRefreshToken: string | null; googleCalendarId: string | null; timezone: string }
): Promise<string | null> {
  switch (name) {
    case "create_item": {
      const title = requireStr(args, "title");
      if (!title) return "I need a title to create that.";
      const categoryName = typeof args.category === "string" ? args.category : "";
      const cats = await listCategories(userId);
      let cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (!cat) {
        cat = cats[0];
      }
      // New accounts are seeded with categories, but anyone who signed up before that lands
      // here with none — and telling a Telegram-first user to go open a website is a dead
      // end. Make the fallback instead of refusing the task.
      if (!cat) {
        cat = await createCategory({ userId, name: "General", color: "#4A6FA5", sortOrder: 0 });
      }

      // A model can hand back "Friday" or a full datetime instead of "YYYY-MM-DD"/"HH:mm" —
      // storing that as-is silently disables all future reminders for the item, so refuse
      // rather than guess.
      let dueDate: string | null = null;
      if (args.due_date != null) {
        dueDate = normalizeDueDate(args.due_date, user.timezone);
        if (!dueDate) return "I couldn't understand that due date — could you give it as a plain date, like 2026-08-25?";
      }
      let dueTime: string | null = null;
      if (args.due_time != null) {
        dueTime = normalizeDueTime(args.due_time);
        if (!dueTime) return "I couldn't understand that due time — could you give it as a 24-hour time, like 14:30?";
      }

      const remindAt = args.remind_at ? parseInTz(args.remind_at as string, user.timezone) : null;
      let recurrenceRule: string | null = null;
      let recurrenceEnd: Date | null = null;
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        recurrenceRule = paramsToRRule(params, remindAt ?? undefined);
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
        recurring: (args.recurring as RecurringType) ?? "none",
        recurrenceRule,
        recurrenceEnd,
      });
      const label = item.remindAt ? "Reminder" : "Task";
      const when = item.remindAt ? ` — ${formatDateInTz(item.remindAt, user.timezone)} ${formatHHmmInTz(item.remindAt, user.timezone)}` : "";
      return `Created ${label}: ${b(item.title)} in ${esc(cat.name)}${when}`;
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
      const status = requested && (["pending", "in_progress", "done"] as string[]).includes(requested)
        ? (requested as ItemStatus)
        : undefined;
      const items = await listItems(userId, { status, categoryId });
      if (items.length === 0) return "No items found.";
      return items.map((item, i) => {
        const icon = item.remindAt ? "🔔" : "📋";
        return `${i + 1}. ${icon} [${item.status}] ${esc(item.title)}`;
      }).join("\n");
    }

    case "complete_item": {
      const title = requireStr(args, "title");
      if (!title) return missing("title");
      const open = await listItems(userId, { status: OPEN_STATUSES });
      const match = matchByTitle(open, title);
      if (match.kind === "none") return `Couldn't find an open item matching "${esc(title)}"`;
      if (match.kind === "many") return ambiguous(match, "complete");
      await updateItem(match.item.id, userId, { status: "done" as ItemStatus });
      return `Completed: ${b(match.item.title)}`;
    }

    case "delete_item": {
      const title = requireStr(args, "title");
      if (!title) return missing("title");
      const items = await listItems(userId);
      const found = matchByTitle(items, title);
      if (found.kind === "none") return `Couldn't find an item matching "${esc(title)}"`;
      if (found.kind === "many") return ambiguous(found, "delete");
      const match = found.item;

      if (match.googleEventId && user.googleRefreshToken) {
        try {
          await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId);
        } catch (error) {
          if (error instanceof CalendarAuthError) throw error;
          console.error("[tool:delete_item] calendar delete failed:", error instanceof Error ? error.message : error);
        }
      }

      await deleteItem(match.id, userId);
      return `Deleted: ${b(match.title)}`;
    }

    case "update_item": {
      const query = requireStr(args, "query");
      if (!query) return missing("task name");
      const open = await listItems(userId, { status: OPEN_STATUSES });
      const found = matchByTitle(open, query);
      if (found.kind === "none") return `Couldn't find an open item matching "${esc(query)}". Try a different title.`;
      if (found.kind === "many") return ambiguous(found, "update");
      const match = found.item;

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
      // An explicit `null` still clears the field — only a non-null value that fails to
      // normalize is refused, so we never overwrite a good due date with garbage.
      if (args.due_date !== undefined) {
        if (args.due_date === null) {
          updates.dueDate = null;
        } else {
          const normalized = normalizeDueDate(args.due_date, user.timezone);
          if (!normalized) return "I couldn't understand that due date — could you give it as a plain date, like 2026-08-25?";
          updates.dueDate = normalized;
        }
      }
      if (args.due_time !== undefined) {
        if (args.due_time === null) {
          updates.dueTime = null;
        } else {
          const normalized = normalizeDueTime(args.due_time);
          if (!normalized) return "I couldn't understand that due time — could you give it as a 24-hour time, like 14:30?";
          updates.dueTime = normalized;
        }
      }
      if (args.remind_at !== undefined) updates.remindAt = args.remind_at ? parseInTz(args.remind_at as string, user.timezone) : null;
      if (args.priority !== undefined) updates.priority = args.priority as Priority;
      if (args.status !== undefined) updates.status = args.status as ItemStatus;
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        const anchor = updates.remindAt ?? match.remindAt ?? undefined;
        updates.recurrenceRule = paramsToRRule(params, anchor ?? undefined);
        updates.recurrenceEnd = params.until ? parseInTz(params.until, user.timezone) : null;
        updates.recurring = params.frequency === "daily" ? "daily"
          : params.frequency === "weekly" ? "weekly"
          : params.frequency === "monthly" ? "monthly"
          : "none";
      }
      if (args.clear_recurrence) {
        updates.recurrenceRule = null;
        updates.recurrenceEnd = null;
        updates.recurring = "none";
      }

      const updated = await updateItem(match.id, userId, updates);

      if (match.googleEventId && user.googleRefreshToken) {
        try {
          const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
          if (updates.title) gcalFields.title = updates.title;
          if (updates.dueDate && updates.dueTime) {
            Object.assign(gcalFields, dueWindowToGcal(updates.dueDate, updates.dueTime));
          }
          if (Object.keys(gcalFields).length > 0) {
            await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId, gcalFields, user.timezone);
          }
        } catch (error) {
          if (error instanceof CalendarAuthError) throw error;
          console.error("[tool:update_item] calendar sync failed:", error instanceof Error ? error.message : error);
        }
      }

      return `Updated: ${b(updated.title)}`;
    }

    case "get_calendar": {
      if (!user.googleRefreshToken) return "Google Calendar not connected. Connect it in Settings.";
      const startDate = requireStr(args, "start_date");
      const endDate = requireStr(args, "end_date");
      if (!startDate || !endDate) return missing("date range");
      const rangeStart = parseInTz(startDate, user.timezone);
      const rangeEnd = parseInTz(endDate, user.timezone);
      if (!rangeStart || !rangeEnd) return "I couldn't understand that date range.";
      if (rangeEnd <= rangeStart) return "That date range ends before it starts — could you rephrase it?";
      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        rangeStart,
        rangeEnd,
        user.timezone
      );
      if (events.length === 0) return "No events in that time range.";
      return events
        .map((e) => `- ${esc(e.title)} (${e.allDay ? `${e.startTime}, all day` : esc(e.startTime.replace("T", " ").slice(0, 16))})`)
        .join("\n");
    }

    case "create_calendar_event": {
      if (!user.googleRefreshToken) return "Google Calendar not connected. Connect it in Settings.";

      const title = requireStr(args, "title");
      const startTime = requireStr(args, "start_time");
      const endTime = requireStr(args, "end_time");
      if (!title) return missing("title");
      if (!startTime || !endTime) return missing("start and end time");
      const description = (args.description as string) ?? undefined;
      const confirmConflict = args.confirm_conflict === true;

      const startInstant = parseInTz(startTime, user.timezone);
      const endInstant = parseInTz(endTime, user.timezone);
      if (!startInstant || !endInstant) return "I couldn't understand the event time.";
      if (endInstant <= startInstant) return "The event's end time must be after its start time.";

      if (!confirmConflict) {
        const existing = await getEvents(
          user.googleRefreshToken,
          user.googleCalendarId ?? "primary",
          startInstant,
          endInstant,
          user.timezone
        );
        // All-day and "free" (transparent) entries don't block a timed booking.
        const conflicts = existing.filter((e) => !e.allDay && e.transparency !== "transparent");

        if (conflicts.length > 0) {
          const conflictLines = conflicts
            .map((e) => `• ${esc(e.title)} (${e.startTime.slice(11, 16)}–${e.endTime.slice(11, 16)})`)
            .join("\n");
          return `Conflict detected — you already have:\n${conflictLines}\n\nStill want me to create ${b(title)} at that time? Reply "yes" and I'll add it anyway.`;
        }
      }

      let recurrence: string[] | undefined;
      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        recurrence = [paramsToRRule(params)];
      }

      const event = await createEvent(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        { title, startTime, endTime, description, recurrence },
        user.timezone
      );

      const warnings: string[] = [];

      const eventDate = formatDateInTz(startInstant, user.timezone);
      const items = await listItems(userId, { status: "pending" as ItemStatus });
      const sameDayTasks = items.filter((item) => item.dueDate === eventDate && !item.googleEventId);
      if (sameDayTasks.length > 0) {
        const taskList = sameDayTasks.slice(0, 3).map((t) => `• ${esc(t.title)}${t.dueTime ? ` (due ${t.dueTime})` : ""}`).join("\n");
        warnings.push(`Heads up — you have ${sameDayTasks.length} task${sameDayTasks.length > 1 ? "s" : ""} due that day:\n${taskList}`);
      }

      const whenLabel = `${formatDateInTz(startInstant, user.timezone)} ${formatHHmmInTz(startInstant, user.timezone)}–${formatHHmmInTz(endInstant, user.timezone)}`;
      let result = `Created calendar event: ${b(event.title)} (${whenLabel})${confirmConflict ? " — added despite the overlap" : ""}`;
      if (warnings.length > 0) {
        result += `\n\n⚠️ ${warnings.join("\n\n")}`;
      }
      return result;
    }

    case "create_category": {
      const name = requireStr(args, "name");
      if (!name) return missing("name");
      const cat = await createCategory({
        userId,
        name,
        color: (args.color as string) ?? null,
      });
      return `Created category: ${b(cat.name)}`;
    }

    case "list_categories": {
      const cats = await listCategories(userId);
      if (cats.length === 0) return "No categories yet.";
      return cats.map((c) => `- ${esc(c.name)}`).join("\n");
    }

    case "update_calendar_event": {
      if (!user.googleRefreshToken) return "Google Calendar not connected. Connect it in Settings.";

      const queryRaw = requireStr(args, "query");
      if (!queryRaw) return missing("event name");
      const query = queryRaw.toLowerCase();
      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};

      if (args.title !== undefined) gcalFields.title = args.title as string;
      if (args.description !== undefined) gcalFields.description = args.description as string;
      if (args.start_time !== undefined) gcalFields.startTime = args.start_time as string;
      if (args.end_time !== undefined) gcalFields.endTime = args.end_time as string;

      if (args.recurrence) {
        const params = args.recurrence as RecurrenceParams;
        (gcalFields as Record<string, unknown>).recurrence = [paramsToRRule(params)];
      }
      if (args.clear_recurrence) {
        (gcalFields as Record<string, unknown>).recurrence = null;
      }

      // Try linked in-app item first
      const items = await listItems(userId);
      const match = items.find((item) =>
        fuzzyMatch(item.title, query) && item.googleEventId
      );

      if (match) {
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
        await updateItem(match.id, userId, updates);
        try {
          await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId!, gcalFields, user.timezone);
        } catch (error) {
          if (error instanceof CalendarAuthError) throw error;
          return `Updated in-app event: ${b(args.title ?? match.title)} (Google Calendar sync failed)`;
        }
        return `Updated calendar event: ${b(args.title ?? match.title)}`;
      }

      // Fallback: search Google Calendar directly
      const now = new Date();
      const searchEnd = new Date(now.getTime() + 90 * 86400000);
      const events = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", now, searchEnd, user.timezone);
      const gcalMatch = events.find((e) => fuzzyMatch(e.title, query));
      if (!gcalMatch) return `Couldn't find a calendar event matching "${esc(queryRaw)}"`;

      try {
        await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", gcalMatch.id, gcalFields, user.timezone);
      } catch (error) {
        if (error instanceof CalendarAuthError) throw error;
        return `Found "${esc(gcalMatch.title)}" but failed to update it in Google Calendar.`;
      }
      return `Updated calendar event: ${b(args.title ?? gcalMatch.title)}`;
    }

    case "delete_calendar_event": {
      if (!user.googleRefreshToken) return "Google Calendar not connected. Connect it in Settings.";

      const queryRaw = requireStr(args, "query");
      if (!queryRaw) return missing("event name");
      const query = queryRaw.toLowerCase();

      // Try linked in-app item first
      const items = await listItems(userId);
      const match = items.find((item) =>
        fuzzyMatch(item.title, query) && item.googleEventId
      );

      if (match) {
        try {
          await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId!);
        } catch {
          // gcal sync failure is non-fatal
        }
        await deleteItem(match.id, userId);
        return `Deleted calendar event: ${b(match.title)}`;
      }

      // Fallback: search Google Calendar directly
      const now = new Date();
      const searchEnd = new Date(now.getTime() + 90 * 86400000);
      const events = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", now, searchEnd, user.timezone);
      const gcalMatch = events.find((e) => fuzzyMatch(e.title, query));
      if (!gcalMatch) return `Couldn't find a calendar event matching "${esc(queryRaw)}"`;

      try {
        await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", gcalMatch.id);
      } catch (error) {
        if (error instanceof CalendarAuthError) throw error;
        return `Found "${esc(gcalMatch.title)}" but failed to delete it from Google Calendar.`;
      }
      return `Deleted calendar event: ${b(gcalMatch.title)}`;
    }

    case "suggest_schedule": {
      const pending = await listItems(userId, { status: "pending" as ItemStatus });
      if (pending.length === 0) return "No pending tasks to schedule.";

      const now = new Date();
      const todayStr = todayInTz(user.timezone, now);
      const today = startOfDayInTz(todayStr, user.timezone);
      const sevenDaysOut = new Date(today.getTime() + 7 * 86400000);

      const taskLines = pending
        .slice(0, 10)
        .map((item) => `- ${esc(item.title)} (priority: ${item.priority}${item.dueDate ? `, due: ${item.dueDate}` : ""})`)
        .join("\n");

      if (!user.googleRefreshToken) {
        return `Here are your pending tasks — Connect Google Calendar in Settings for time-slot suggestions:\n\n${taskLines}`;
      }

      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        now,
        sevenDaysOut,
        user.timezone
      );

      const workStart = 9 * 60;
      const workEnd = 18 * 60;
      const freeBlocks: string[] = [];
      const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

      for (let d = 0; d < 7; d++) {
        const day = new Date(today.getTime() + d * 86400000);
        const dateStr = formatDateInTz(day, user.timezone);
        const dayEvents = events
          .filter((e) => !e.allDay && e.transparency !== "transparent")
          .map((e) => {
            const start = new Date(e.startTime);
            const end = new Date(e.endTime);
            return { start, end, startMin: toMinutesOfDay(start, user.timezone), endMin: toMinutesOfDay(end, user.timezone) };
          })
          .filter((e) => formatDateInTz(e.start, user.timezone) === dateStr)
          .sort((a, b2) => a.startMin - b2.startMin);

        let cursor = workStart;
        for (const ev of dayEvents) {
          if (cursor < ev.startMin) {
            freeBlocks.push(`${dateStr} ${fmt(cursor)}–${fmt(ev.startMin)}`);
          }
          cursor = Math.max(cursor, ev.endMin);
        }
        if (cursor < workEnd) {
          freeBlocks.push(`${dateStr} ${fmt(cursor)}–${fmt(workEnd)}`);
        }
      }

      const freeLines = freeBlocks.slice(0, 6).join(", ") || "No free blocks found in working hours (9am–6pm)";

      return `${b("Pending tasks:")}\n${taskLines}\n\n${b("Free blocks this week:")}\n${freeLines}\n\n${b("Suggested:")} Work on your highest-priority tasks during morning free blocks. Consider blocking calendar time for deep work items.`;
    }

    case "decompose_task": {
      const parentTitle = requireStr(args, "parent_title");
      if (!parentTitle) return missing("task name");
      const open = await listItems(userId, { status: OPEN_STATUSES });
      const found = matchByTitle(open, parentTitle);
      if (found.kind === "none") return `Couldn't find an open task matching "${esc(parentTitle)}"`;
      if (found.kind === "many") return ambiguous(found, "break down");
      const match = found.item;

      const subtasks = Array.isArray(args.subtasks) ? (args.subtasks as Array<{ title: string; priority?: string }>) : [];
      if (subtasks.length === 0) return "I need a list of subtasks to break that down.";
      const created: string[] = [];
      for (const sub of subtasks) {
        await createItem({
          userId,
          categoryId: match.categoryId,
          title: sub.title,
          priority: (sub.priority as Priority) ?? match.priority,
          parentId: match.id,
        });
        created.push(sub.title);
      }
      return `Decomposed ${b(match.title)} into ${created.length} subtasks:\n${created.map((t) => `• ${esc(t)}`).join("\n")}`;
    }

    case "search_items": {
      const query = requireStr(args, "query");
      if (!query) return missing("search term");
      const results = await searchItems(userId, query);
      if (results.length === 0) return `No items matching "${esc(query)}"`;
      return results
        .map((r, i) => {
          const icon = r.type === "reminder" ? "🔔" : "📋";
          const status = r.status === "done" ? "✓" : r.status === "in_progress" ? "⟳" : "○";
          return `${i + 1}. ${icon} ${status} ${esc(r.title)}${r.dueDate ? ` (${r.dueDate})` : ""} — ${esc(r.category.name)}`;
        })
        .join("\n");
    }

    default:
      return null;
  }
}

function toMinutesOfDay(date: Date, tz: string): number {
  const [h, m] = formatHHmmInTz(date, tz).split(":").map(Number);
  return h * 60 + m;
}
