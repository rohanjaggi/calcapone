import { prisma } from "@/lib/prisma";
import { listItems, OPEN_STATUSES } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { buildTimeline } from "@/lib/timeline";
import { startOfDayInTz, endOfDayInTz, todayInTz, combineDateTimeInTz } from "@/lib/tz";
import { deadlineUrgency, type Severity, type Urgency } from "@/lib/services/escalation";
import type { Item, AgendaEvent, TimelineItem } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

export type AheadItem = {
  id: string;
  title: string;
  dueDate: string;
  categoryName: string;
  color: string;
  urgency: Urgency;
};

export type Agenda = {
  /** Across every open item, not just the window — StatsRow means "what's left overall". */
  priorityCounts: Record<Priority, number>;
  strip: Array<{ date: string; taskCount: number; eventCount: number; severity: Severity | null }>;
  byDay: Record<string, TimelineItem[]>;
  categories: Array<{ id: string; name: string; color: string }>;
  /**
   * The nearest deadlines regardless of which day is selected, overdue first. The timeline
   * answers "what is on this day"; without this the dashboard could not answer "what is
   * coming that I should worry about" without hunting day by day.
   */
  ahead: AheadItem[];
};

export const AGENDA_DAYS = 7;

/** Enough to see what's looming without turning the dashboard into a second task list. */
export const AHEAD_LIMIT = 5;

/** Worst-first, so a day's dot takes the colour of the most pressing thing on it. */
const SEVERITY_RANK: Record<Severity, number> = { overdue: 0, urgent: 1, soon: 2, upcoming: 3 };

const DEFAULT_CATEGORY_COLOR = "#92785C";

/** Shift a "YYYY-MM-DD" by whole days without routing through a local-time Date. */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Everything the dashboard renders, in one payload.
 *
 * Calendar events come from the local `calendar_events` mirror, never the Google API: the
 * mirror spans -7 to +90 days (see calendar-sync.ts), so a seven-day window is always well
 * inside it. That is what lets the dashboard render server-side with no token refresh, no
 * network round-trip and no streaming promise — and it is why the dashboard can show events
 * at all, which it never could before.
 *
 * The mirror has two writers. The sync cron pulls down whatever changed on Google, which is
 * the only way changes made *outside* the app arrive, and its cadence is set by the external
 * scheduler — `RESYNC_THRESHOLD_MS` is a floor between passes, not a promise about how often
 * one happens. Writes the app makes itself are mirrored at the point of the write instead
 * (`mirrorEvent`/`unmirrorEvent`), because waiting for a pull meant the bot could confirm an
 * event to the user that their own dashboard could not yet see.
 *
 * All seven days ship at once. It is tens of rows, so day-switching is pure client state
 * rather than a server round-trip per tap.
 */
export async function getAgenda(
  userId: string,
  tz: string,
  anchorDate: string,
  days: number = AGENDA_DAYS,
  now: Date = new Date()
): Promise<Agenda> {
  const dates = Array.from({ length: days }, (_, i) => shiftDate(anchorDate, i));
  const windowStart = startOfDayInTz(dates[0], tz);
  const windowEnd = endOfDayInTz(dates[dates.length - 1], tz);

  const [openItems, eventRows, categoryRows] = await Promise.all([
    listItems(userId, { status: OPEN_STATUSES }),
    prisma.calendarEvent.findMany({
      where: { userId, startsAt: { gte: windowStart, lt: windowEnd } },
      orderBy: { startsAt: "asc" },
    }),
    listCategories(userId),
  ]);

  const priorityCounts = openItems.reduce<Record<Priority, number>>(
    (acc, i) => {
      acc[i.priority] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const events: AgendaEvent[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    allDay: e.allDay,
  }));

  const items: Item[] = openItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: {
      id: item.category.id,
      name: item.category.name,
      color: item.category.color ?? DEFAULT_CATEGORY_COLOR,
    },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
    googleEventId: item.googleEventId ?? null,
  }));

  const byDay: Record<string, TimelineItem[]> = {};
  for (const date of dates) byDay[date] = buildTimeline(items, events, tz, date, now);

  const strip = dates.map((date) => {
    const rows = byDay[date];
    const worst = rows
      .map((r) => r.urgency?.severity)
      .filter((sev): sev is Severity => !!sev)
      .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
    return {
      date,
      taskCount: rows.filter((r) => r.type === "item").length,
      eventCount: rows.filter((r) => r.type === "event").length,
      severity: worst ?? null,
    };
  });

  const todayStr = todayInTz(tz, now);
  const ahead: AheadItem[] = openItems
    .filter((item) => item.dueDate && !item.remindAt)
    .map((item) => ({
      id: item.id,
      title: item.title,
      dueDate: item.dueDate!,
      categoryName: item.category.name,
      color: item.category.color ?? DEFAULT_CATEGORY_COLOR,
      urgency: deadlineUrgency(item.dueDate, item.dueTime, todayStr, now, (d, t) =>
        combineDateTimeInTz(d, t, tz)
      )!,
    }))
    // Soonest first, overdue at the top — the ordering someone scanning for trouble expects.
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .slice(0, AHEAD_LIMIT);

  const categories = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? DEFAULT_CATEGORY_COLOR,
  }));

  return { priorityCounts, strip, byDay, categories, ahead };
}
