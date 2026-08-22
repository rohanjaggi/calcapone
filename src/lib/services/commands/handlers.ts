import { listItems, updateItem, createItem, OPEN_STATUSES } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { searchItems } from "@/lib/services/search";
import { getEvents } from "@/lib/services/calendar";
import { esc, b } from "@/lib/services/telegram";
import { matchByTitle } from "@/lib/services/match-items";
import {
  todayInTz,
  formatDateInTz,
  formatHHmmInTz,
  startOfDayInTz,
  endOfDayInTz,
  weekdayInTz,
  isSelectableTz,
} from "@/lib/tz";
import { updateUserSettings } from "@/lib/services/user";
import { latestListRef, resolvePosition } from "@/lib/services/message-ref";
import { renderGroupedList, renderFlatList } from "./format";
import { undoLast } from "@/lib/services/action-log";
import type { ItemStatus } from "@/generated/prisma/enums";
import type { CommandContext, CommandReply } from "./index";

export async function handleDone(body: string, ctx: CommandContext): Promise<CommandReply> {
  if (!body) return { text: "Usage: /done task name" };

  const open = await listItems(ctx.userId, { status: OPEN_STATUSES });

  if (/^\d+$/.test(body)) {
    const ref = await latestListRef(ctx.userId, ctx.chatId);
    if (!ref) {
      return { text: "I don't have a recent numbered list — try /list first, or /done <task name>" };
    }
    const id = resolvePosition(ref.itemIds, body);
    const target = id ? open.find((item) => item.id === id) : undefined;
    if (target) {
      await updateItem(target.id, ctx.userId, { status: "done" as ItemStatus });
      return { text: `Completed: ${b(target.title)}` };
    }
    // The number pointed past the remembered list, or at something no longer open (already
    // done, deleted). Fall through to title matching, which reports "no match" for a bare
    // number rather than silently doing nothing.
  }

  const found = matchByTitle(open, body);

  if (found.kind === "none") return { text: `No open task matching "${esc(body)}"` };
  // Several hits: taking the first silently completed the wrong task ("call" -> "Call dentist").
  if (found.kind === "many") {
    const options = found.items.slice(0, 5).map((item) => `• ${esc(item.title)}`).join("\n");
    const more = found.items.length > 5 ? `\n…and ${found.items.length - 5} more` : "";
    return { text: `That matches ${found.items.length} tasks — which one?\n${options}${more}` };
  }

  await updateItem(found.item.id, ctx.userId, { status: "done" as ItemStatus });
  return { text: `Completed: ${b(found.item.title)}` };
}

export async function handleToday(ctx: CommandContext): Promise<CommandReply> {
  const now = new Date();
  const tz = ctx.user.timezone;
  const todayStr = todayInTz(tz, now);

  const allPending = await listItems(ctx.userId, { status: OPEN_STATUSES });

  const overdue = allPending.filter(
    (item) => item.dueDate && item.dueDate < todayStr && !item.remindAt
  );
  const todayItems = allPending.filter(
    (item) => item.dueDate === todayStr && !item.remindAt
  );
  const todayReminders = allPending.filter((item) => {
    if (!item.remindAt) return false;
    return formatDateInTz(item.remindAt, tz) === todayStr;
  });

  // Flat, in visual order, so the numbers printed below line up 1:1 with this array —
  // that's what lets a reply like `/done 3` resolve without re-parsing the message.
  const itemIds = [...overdue, ...todayItems, ...todayReminders].map((item) => item.id);

  const parts: string[] = [];
  let n = 0;

  if (overdue.length > 0) {
    parts.push(b(`Overdue (${overdue.length})`));
    overdue.forEach((item) => parts.push(`${++n}. ${esc(item.title)} — due ${item.dueDate}`));
  }

  if (todayItems.length > 0 || todayReminders.length > 0) {
    parts.push(`\n${b(`Today (${todayItems.length + todayReminders.length})`)}`);
    todayItems.forEach((item) => {
      const time = item.dueTime ? ` ${item.dueTime}` : "";
      parts.push(`${++n}.${time} ${esc(item.title)}`);
    });
    todayReminders.forEach((item) => {
      const time = item.remindAt ? ` ${formatHHmmInTz(item.remindAt, tz)}` : "";
      parts.push(`${++n}. 🔔${time} ${esc(item.title)}`);
    });
  }

  if (ctx.user.googleRefreshToken) {
    try {
      const startOfDay = startOfDayInTz(todayStr, tz);
      const threeDaysOut = new Date(startOfDay.getTime() + 3 * 86400000);
      const events = await getEvents(
        ctx.user.googleRefreshToken,
        ctx.user.googleCalendarId ?? "primary",
        now,
        threeDaysOut,
        tz
      );
      const upcoming = events.slice(0, 3);
      if (upcoming.length > 0) {
        parts.push(`\n${b("Next up")}`);
        // Calendar events aren't items — no id to number them by, so they stay bulleted.
        upcoming.forEach((e) => {
          if (e.allDay) {
            const dateLabel = e.startTime === todayStr ? "Today" : e.startTime;
            parts.push(`• ${dateLabel} (all day) — ${esc(e.title)}`);
            return;
          }
          const start = new Date(e.startTime);
          const dateStr = formatDateInTz(start, tz);
          const dateLabel = dateStr === todayStr ? "Today" : dateStr;
          parts.push(`• ${dateLabel} ${formatHHmmInTz(start, tz)} — ${esc(e.title)}`);
        });
      }
    } catch (error) {
      console.error("[commands:/today] calendar fetch failed:", error instanceof Error ? error.message : error);
    }
  }

  if (parts.length === 0) return { text: "Nothing scheduled for today!" };
  return { text: parts.join("\n"), ...(itemIds.length > 0 ? { itemIds } : {}) };
}

/** Add days to a YYYY-MM-DD string via calendar-date arithmetic, not tz-instant math — see endOfDayInTz. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function handleWeek(ctx: CommandContext): Promise<CommandReply> {
  const now = new Date();
  const tz = ctx.user.timezone;
  const todayStr = todayInTz(tz, now);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(todayStr, i));
  const lastDay = days[days.length - 1];

  const allPending = await listItems(ctx.userId, { status: OPEN_STATUSES });

  const eventsByDay = new Map<string, Array<{ title: string; startTime: string; allDay: boolean }>>();
  if (ctx.user.googleRefreshToken) {
    try {
      const events = await getEvents(
        ctx.user.googleRefreshToken,
        ctx.user.googleCalendarId ?? "primary",
        startOfDayInTz(todayStr, tz),
        endOfDayInTz(lastDay, tz),
        tz
      );
      for (const e of events) {
        const dayKey = e.allDay ? e.startTime : formatDateInTz(new Date(e.startTime), tz);
        const bucket = eventsByDay.get(dayKey) ?? [];
        bucket.push(e);
        eventsByDay.set(dayKey, bucket);
      }
    } catch (error) {
      console.error("[commands:/week] calendar fetch failed:", error instanceof Error ? error.message : error);
    }
  }

  const parts: string[] = [];
  const itemIds: string[] = [];
  let n = 0;

  days.forEach((dateStr, i) => {
    const dueItems = allPending.filter((item) => item.dueDate === dateStr && !item.remindAt);
    const reminderItems = allPending.filter(
      (item) => item.remindAt && formatDateInTz(item.remindAt, tz) === dateStr
    );
    const dayEvents = eventsByDay.get(dateStr) ?? [];

    if (dueItems.length === 0 && reminderItems.length === 0 && dayEvents.length === 0) return;

    const label =
      i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${weekdayInTz(startOfDayInTz(dateStr, tz), tz)} ${dateStr}`;
    parts.push(`\n${b(label)}`);

    dueItems.forEach((item) => {
      const time = item.dueTime ? ` ${item.dueTime}` : "";
      itemIds.push(item.id);
      parts.push(`${++n}.${time} ${esc(item.title)}`);
    });
    reminderItems.forEach((item) => {
      const time = item.remindAt ? ` ${formatHHmmInTz(item.remindAt, tz)}` : "";
      itemIds.push(item.id);
      parts.push(`${++n}. 🔔${time} ${esc(item.title)}`);
    });
    // Not numbered, not in itemIds — only items are actionable by number.
    dayEvents.forEach((e) => {
      if (e.allDay) {
        parts.push(`• (all day) — ${esc(e.title)}`);
        return;
      }
      parts.push(`• ${formatHHmmInTz(new Date(e.startTime), tz)} — ${esc(e.title)}`);
    });
  });

  if (parts.length === 0) return { text: "Nothing scheduled for the next 7 days." };
  return { text: parts.join("\n"), ...(itemIds.length > 0 ? { itemIds } : {}) };
}

/**
 * Everything still open, grouped by when it's due.
 *
 * The flat version of this listed items in `listItems`' `priority desc, createdAt desc` order,
 * which reads as noise: a task due in six weeks could sit above one that was due yesterday.
 * Grouping is what makes the sort legible — the same shape `/today` and `/week` already use.
 */
export async function handleList(body: string, ctx: CommandContext): Promise<CommandReply> {
  const filters = body === "all" ? {} : { status: OPEN_STATUSES };
  const items = await listItems(ctx.userId, filters);

  if (items.length === 0) return { text: "No items found." };

  return renderGroupedList(items, ctx.user.timezone);
}

/**
 * Instant capture: no AI call, so this stays free and immediate even when the model or its
 * API key is unavailable. Filed under the user's first category since there's nothing here
 * to classify by.
 */
export async function handleNote(body: string, ctx: CommandContext): Promise<CommandReply> {
  if (!body) return { text: "Usage: /note something to remember" };

  const categories = await listCategories(ctx.userId);
  const [firstCategory] = categories;
  if (!firstCategory) return { text: "You don't have any categories yet — try /todo instead." };

  const item = await createItem({
    userId: ctx.userId,
    categoryId: firstCategory.id,
    title: body,
  });

  return { text: `📝 Noted: ${b(item.title)}` };
}

export async function handleSearch(body: string, ctx: CommandContext): Promise<CommandReply> {
  if (!body) return { text: "Usage: /search keyword" };

  const results = await searchItems(ctx.userId, body);
  if (results.length === 0) return { text: `No items matching "${esc(body)}"` };

  const capped = results.slice(0, 10);
  // `sort: false` on purpose — these come back ranked by relevance, and reordering them by due
  // date would bury the item the user actually described under whatever is merely due soonest.
  return renderFlatList(capped, ctx.user.timezone, { sort: false });
}

export async function handleUndo(ctx: CommandContext): Promise<CommandReply> {
  const result = await undoLast({
    id: ctx.userId,
    timezone: ctx.user.timezone,
    googleRefreshToken: ctx.user.googleRefreshToken,
    googleCalendarId: ctx.user.googleCalendarId,
  });

  if (result.ok) {
    // `summary` is already HTML-escaped by whoever wrote the ActionLog row — re-escaping
    // here would turn "Buy &lt;milk&gt;" into "Buy &amp;lt;milk&amp;gt;".
    return { text: `↩️ Undid: ${result.summary}` };
  }
  if (result.reason === "none") return { text: "Nothing to undo." };
  return { text: "I couldn't undo that — it may have changed since." };
}

/**
 * Show or change the timezone every date in the bot is rendered in. Without this a non-SG
 * user was stuck on the Asia/Singapore default with no way to change it from Telegram.
 */
/** Longer than this and the "starting soon" ping stops being about starting soon. */
const MAX_EVENT_LEAD_MINUTES = 720;

/**
 * How much warning to give before a calendar event starts.
 *
 * Lives as a command rather than only in the dashboard because the moment you want to change
 * it is the moment a ping arrived too late — and that moment happens in the chat.
 */
export async function handleAlerts(body: string, ctx: CommandContext): Promise<CommandReply> {
  const current = ctx.user.eventReminderMinutes;

  if (!body) {
    return {
      text:
        current == null
          ? [
              "Event-start alerts are <b>off</b>.",
              "",
              "Turn them on with <code>/alerts 15</code> — I'll ping you 15 minutes before anything on your calendar starts.",
            ].join("\n")
          : `I ping you ${b(`${current} min`)} before a calendar event starts.\n\nChange it with <code>/alerts 30</code>, or switch it off with <code>/alerts off</code>.`,
    };
  }

  if (/^(off|none|0)$/i.test(body.trim())) {
    await updateUserSettings(ctx.userId, { eventReminderMinutes: null });
    return { text: "Event-start alerts are off." };
  }

  const minutes = Number(body.trim().replace(/\s*m(in(utes)?)?$/i, ""));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_EVENT_LEAD_MINUTES) {
    return { text: `Give me a whole number of minutes between 1 and ${MAX_EVENT_LEAD_MINUTES}, e.g. <code>/alerts 15</code>.` };
  }

  await updateUserSettings(ctx.userId, { eventReminderMinutes: minutes });
  return { text: `I'll ping you ${b(`${minutes} min`)} before a calendar event starts.` };
}

export async function handleTimezone(body: string, ctx: CommandContext): Promise<CommandReply> {
  const current = ctx.user.timezone;
  if (!body) {
    return {
      text: [
        `Your timezone is ${b(current)} — it's ${formatHHmmInTz(new Date(), current)} for you right now.`,
        "",
        "To change it, send the IANA name, e.g. <code>/timezone Europe/London</code>",
      ].join("\n"),
    };
  }

  const requested = body.trim();
  if (!isSelectableTz(requested)) {
    return {
      text: `I don't recognise ${b(requested)}. Use an IANA name like <code>Europe/London</code>, <code>America/New_York</code> or <code>Asia/Singapore</code>.`,
    };
  }

  if (requested === current) return { text: `Already set to ${b(current)}.` };

  await updateUserSettings(ctx.userId, { timezone: requested });
  return { text: `Timezone set to ${b(requested)} — it's ${formatHHmmInTz(new Date(), requested)} there now.` };
}
