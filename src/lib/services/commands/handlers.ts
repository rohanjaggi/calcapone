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
  addDays,
} from "@/lib/tz";
import { updateUserSettings, changeTimezone } from "@/lib/services/user";
import { latestListRef, resolvePosition } from "@/lib/services/message-ref";
import { renderGroupedList, renderFlatList } from "./format";
import { undoLast, recordAction } from "@/lib/services/action-log";
import { completionRecord } from "@/lib/services/tool-outcome";
import type { ItemStatus } from "@/generated/prisma/enums";
import type { CommandContext, CommandReply } from "./index";

export async function handleDone(body: string, ctx: CommandContext): Promise<CommandReply> {
  if (!body) return { text: "Usage: /done task name" };

  const top = await listItems(ctx.userId, { status: OPEN_STATUSES });
  // Subtasks count too: "break down X" makes them, and nothing else in chat could tick them off.
  const open = [...top, ...top.flatMap((item) => item.subtasks.filter((sub) => sub.status !== "done"))];

  if (/^\d+$/.test(body)) {
    const ref = await latestListRef(ctx.userId, ctx.chatId);
    if (!ref) {
      return { text: "I don't have a recent numbered list — try /list first, or /done <task name>" };
    }
    const id = resolvePosition(ref.itemIds, body);
    const target = id ? open.find((item) => item.id === id) : undefined;
    if (target) return complete(target, ctx);
    // A number is never matched as a title: "/done 7" against a 5-item list completed "Dinner at 7pm".
    return {
      text: id
        ? `#${body} in your last list is already done or gone.`
        : `There's no #${body} in your last list — it has ${ref.itemIds.length}.`,
    };
  }

  const found = matchByTitle(open, body);

  if (found.kind === "none") return { text: `No open task matching "${esc(body)}"` };
  // Several hits: taking the first silently completed the wrong task ("call" -> "Call dentist").
  // Numbered and remembered, so "/done 2" picks one straight away.
  if (found.kind === "many") {
    const options = found.items.slice(0, 5);
    const lines = options.map((item, i) => `${i + 1}. ${esc(item.title)}${item.dueDate ? ` — ${item.dueDate}` : ""}`).join("\n");
    const more = found.items.length > 5 ? `\n…and ${found.items.length - 5} more` : "";
    return {
      text: `That matches ${found.items.length} tasks — which one? Send <code>/done 1</code>, <code>/done 2</code>…\n${lines}${more}`,
      itemIds: options.map((item) => item.id),
    };
  }

  return complete(found.item, ctx);
}

/** Journalled like the AI's complete_item, so `/undo` straight after reverses this one. */
async function complete(
  item: { id: string; title: string; status: ItemStatus },
  ctx: CommandContext
): Promise<CommandReply> {
  await updateItem(item.id, ctx.userId, { status: "done" as ItemStatus });
  await recordAction(ctx.userId, ctx.chatId, completionRecord(item));
  return { text: `Completed: ${b(item.title)}` };
}

/**
 * What "today" holds: overdue dated tasks, tasks due today, and reminders ringing today. Shared
 * by /today and the morning briefing, which used to disagree (a 3pm reminder with no due date
 * was in one and not the other).
 */
export function todaySelection<T extends { dueDate: string | null; remindAt: Date | null }>(
  items: T[],
  tz: string,
  todayStr: string
): { overdue: T[]; todayItems: T[]; todayReminders: T[] } {
  return {
    overdue: items.filter((item) => item.dueDate && item.dueDate < todayStr && !item.remindAt),
    todayItems: items.filter((item) => item.dueDate === todayStr && !item.remindAt),
    todayReminders: items.filter((item) => item.remindAt && formatDateInTz(item.remindAt, tz) === todayStr),
  };
}

export async function handleToday(ctx: CommandContext): Promise<CommandReply> {
  const now = new Date();
  const tz = ctx.user.timezone;
  const todayStr = todayInTz(tz, now);

  const allPending = await listItems(ctx.userId, { status: OPEN_STATUSES });
  const { overdue, todayItems, todayReminders } = todaySelection(allPending, tz, todayStr);

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

export async function handleWeek(ctx: CommandContext): Promise<CommandReply> {
  const now = new Date();
  const tz = ctx.user.timezone;
  const todayStr = todayInTz(tz, now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayStr, i));
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
  // Journalled: otherwise /undo right after a /note reversed whatever came before it.
  await recordAction(ctx.userId, ctx.chatId, {
    kind: "create_item",
    summary: `noted ${b(item.title)}`,
    inverse: { op: "delete_item", itemId: item.id },
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

  const moved = await changeTimezone(ctx.userId, current, requested);
  const kept = moved > 0 ? ` Your ${moved} pending reminder${moved === 1 ? "" : "s"} keep their clock times there.` : "";
  return { text: `Timezone set to ${b(requested)} — it's ${formatHHmmInTz(new Date(), requested)} there now.${kept}` };
}
