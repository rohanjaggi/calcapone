import { listItems, updateItem, createItem, OPEN_STATUSES } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { searchItems } from "@/lib/services/search";
import {
  createCourse,
  listCourses,
  findCourse,
  setCourseArchived,
  countCourseItems,
  deleteCourse,
} from "@/lib/services/course";
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
import { renderGroupedList, renderFlatList, sortByDue } from "./format";
import { undoLast } from "@/lib/services/action-log";
import type { ItemStatus } from "@/generated/prisma/enums";
import type { Course } from "@/generated/prisma/client";
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

/** Calendar-day gap between two YYYY-MM-DD strings — same UTC-arithmetic reasoning as addDaysToDateStr. */
function daysBetweenDateStrs(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
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

/** Prisma's unique-constraint code, duck-typed rather than pulling in PrismaClientKnownRequestError. */
function isDuplicateCourseCode(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

async function handleAddCourse(body: string, ctx: CommandContext): Promise<CommandReply> {
  const [codeRaw, ...rest] = body.trim().split(/\s+/);
  const name = rest.join(" ").trim();
  if (!codeRaw || !name) return { text: "Usage: /courses add <CODE> <Name>" };

  const code = codeRaw.toUpperCase();
  try {
    const course = await createCourse({ userId: ctx.userId, code, name });
    return { text: `Added ${b(course.code)} — ${esc(course.name)}` };
  } catch (error) {
    // A collision here means the user is re-adding a course they forgot they already have —
    // that's a mistake to correct gently, not a 500.
    if (isDuplicateCourseCode(error)) return { text: `${b(code)} already exists.` };
    throw error;
  }
}

/** Prisma's "record to update/delete not found" code. */
function isMissingRow(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2025";
}

function pluralItems(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

/**
 * The course a subcommand names, or the reply explaining why we couldn't get one.
 *
 * Resolution goes through `findCourse`, which deliberately sees archived courses too —
 * otherwise `/courses unarchive` could never reach the very rows it exists to bring back.
 */
async function resolveCourseArg(
  verb: string,
  body: string,
  ctx: CommandContext
): Promise<{ course: Course } | { reply: CommandReply }> {
  const query = body.trim();
  if (!query) return { reply: { text: `Usage: /courses ${verb} <CODE>` } };

  const course = await findCourse(ctx.userId, query);
  if (!course) {
    return { reply: { text: `I don't know a course matching "${esc(query)}" — ${b("/courses all")} lists them.` } };
  }
  return { course };
}

/** `/courses archive|unarchive <CODE>`. Items keep their `courseId` either way — that's the point. */
async function handleSetCourseArchived(
  body: string,
  ctx: CommandContext,
  archived: boolean
): Promise<CommandReply> {
  const verb = archived ? "archive" : "unarchive";
  const resolved = await resolveCourseArg(verb, body, ctx);
  if ("reply" in resolved) return resolved.reply;
  const { course } = resolved;

  if (course.archived === archived) {
    return { text: `${b(course.code)} is already ${archived ? "archived" : "active"}.` };
  }

  await setCourseArchived(course.id, ctx.userId, archived);
  if (!archived) return { text: `Unarchived ${b(course.code)} — ${esc(course.name)}` };

  // Say the item count out loud: "archive" reads like "delete" to most people, and the whole
  // reason to prefer it is that nothing is lost.
  const count = await countCourseItems(course.id, ctx.userId);
  const kept = count === 0 ? "No items were tagged with it." : `${pluralItems(count)} kept their tag.`;
  return { text: `Archived ${b(course.code)} — ${esc(course.name)}\n${kept}` };
}

/**
 * `/courses remove <CODE>` — a real delete, for a course added by mistake.
 *
 * Gated on the course being empty. The FK is `onDelete: SetNull`, so deleting a course with
 * work under it silently strips the tag off a semester's assignments; archiving is what the
 * user almost always meant, so point them at it rather than doing the destructive thing.
 */
async function handleRemoveCourse(body: string, ctx: CommandContext): Promise<CommandReply> {
  const resolved = await resolveCourseArg("remove", body, ctx);
  if ("reply" in resolved) return resolved.reply;
  const { course } = resolved;

  const count = await countCourseItems(course.id, ctx.userId);
  if (count > 0) {
    return {
      text:
        `${b(course.code)} still has ${pluralItems(count)} — deleting it would untag them for good.\n` +
        `${b(`/courses archive ${course.code}`)} hides the course and keeps the tag.`,
    };
  }

  try {
    await deleteCourse(course.id, ctx.userId);
  } catch (error) {
    // Raced with another delete. The user's goal is already met, so this isn't an error.
    if (!isMissingRow(error)) throw error;
    return { text: `${b(course.code)} is already gone.` };
  }
  return { text: `Deleted ${b(course.code)} — ${esc(course.name)}` };
}

/** `/courses` (active only) and `/courses all` (everything, archived marked). */
async function handleListCourses(ctx: CommandContext, includeArchived: boolean): Promise<CommandReply> {
  // Always one query: `listCourses` already sorts archived last, so the bare view is a filter
  // over the same rows rather than a second round trip.
  const all = await listCourses(ctx.userId, { includeArchived: true });
  if (all.length === 0) {
    return { text: `No courses yet — tell me: ${b("add course CS2040 Data Structures")}` };
  }

  const shown = includeArchived ? all : all.filter((course) => !course.archived);
  const archivedCount = all.length - all.filter((course) => !course.archived).length;

  if (shown.length === 0) {
    return { text: `No active courses — ${archivedCount} archived. ${b("/courses all")} shows them.` };
  }

  const lines = shown.map((course) => {
    const suffix = course.archived ? " (archived)" : "";
    return `${esc(course.code)} — ${esc(course.name)}${suffix}`;
  });

  const footer = !includeArchived && archivedCount > 0 ? `\n\n${archivedCount} archived — ${b("/courses all")}` : "";
  return { text: lines.join("\n") + footer };
}

/**
 * `/courses` and its subcommands. A course is not a Category, so it gets its own list —
 * and its own retirement path, since a semester ends but its assignments stay worth reading.
 */
export async function handleCourses(body: string, ctx: CommandContext): Promise<CommandReply> {
  // Verb split keeps the remainder raw so a multi-word course name survives intact.
  const match = body.trim().match(/^(\S+)([\s\S]*)$/);
  const verb = match?.[1]?.toLowerCase() ?? "";
  const rest = match?.[2]?.trim() ?? "";

  switch (verb) {
    case "add":
      return handleAddCourse(rest, ctx);
    case "archive":
      return handleSetCourseArchived(rest, ctx, true);
    case "unarchive":
      return handleSetCourseArchived(rest, ctx, false);
    case "remove":
      return handleRemoveCourse(rest, ctx);
    case "all":
      return handleListCourses(ctx, true);
    default:
      return handleListCourses(ctx, false);
  }
}

export async function handleExams(ctx: CommandContext): Promise<CommandReply> {
  const tz = ctx.user.timezone;
  const todayStr = todayInTz(tz);

  const [open, courses] = await Promise.all([
    listItems(ctx.userId, { status: OPEN_STATUSES }),
    // Archived courses included: this map only labels items that already exist, and an exam
    // from a retired module still needs its code shown.
    listCourses(ctx.userId, { includeArchived: true }),
  ]);
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const exams = open
    .filter((item) => item.kind === "exam" && item.dueDate !== null && item.dueDate >= todayStr)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));

  if (exams.length === 0) return { text: "No exams scheduled. 🎉" };

  const text = exams
    .map((item, i) => {
      const days = daysBetweenDateStrs(todayStr, item.dueDate!);
      const distance = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      const course = item.courseId ? courseById.get(item.courseId) : undefined;
      const prefix = course ? `${esc(course.code)} — ` : "";
      return `${i + 1}. ${prefix}${esc(item.title)} (${distance})`;
    })
    .join("\n");

  return { text, itemIds: exams.map((item) => item.id) };
}

export async function handleDue(body: string, ctx: CommandContext): Promise<CommandReply> {
  const query = body.trim();
  if (!query) return { text: "Usage: /due <course> — e.g. /due CS2040" };

  const course = await findCourse(ctx.userId, query);
  if (!course) {
    return { text: `I don't know a course matching "${esc(query)}" — ${b("/courses all")} lists them.` };
  }

  const open = await listItems(ctx.userId, { status: OPEN_STATUSES });
  const items = open.filter((item) => item.courseId === course.id);

  if (items.length === 0) return { text: `No open items for ${b(course.code)}.` };

  // Assignments and exams are the things with real deadlines — surface them ahead of class
  // sessions and anything else merely tagged with the course.
  // Graded work first, then everything else — but soonest-first inside each group, so the
  // assignment due this week can't sit below the exam in December.
  const tz = ctx.user.timezone;
  const primary = items.filter((item) => item.kind === "assignment" || item.kind === "exam");
  const rest = items.filter((item) => item.kind !== "assignment" && item.kind !== "exam");
  const ordered = [...sortByDue(primary, tz), ...sortByDue(rest, tz)];

  const lines = ordered
    .map((item, i) => {
      const due = item.dueDate ? ` — due ${item.dueDate}` : "";
      return `${i + 1}. ${esc(item.title)}${due}`;
    })
    .join("\n");

  return { text: `${b(course.code)}\n${lines}`, itemIds: ordered.map((item) => item.id) };
}
