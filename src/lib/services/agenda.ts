import { prisma } from "@/lib/prisma";
import { listItems, OPEN_STATUSES } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { buildTimeline } from "@/lib/timeline";
import { startOfDayInTz, endOfDayInTz } from "@/lib/tz";
import type { Item, AgendaEvent, TimelineItem } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

export type Agenda = {
  /** Across every open item, not just the window — StatsRow means "what's left overall". */
  priorityCounts: Record<Priority, number>;
  strip: Array<{ date: string; taskCount: number; eventCount: number }>;
  byDay: Record<string, TimelineItem[]>;
  categories: Array<{ id: string; name: string; color: string }>;
};

export const AGENDA_DAYS = 7;

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
 * mirror spans -7 to +90 days (see calendar-sync.ts) and the cron refreshes it every ~4
 * minutes, so a seven-day window is always well inside it. That is what lets the dashboard
 * render server-side with no token refresh, no network round-trip and no streaming promise —
 * and it is why the dashboard can show events at all, which it never could before.
 *
 * All seven days ship at once. It is tens of rows, so day-switching is pure client state
 * rather than a server round-trip per tap.
 */
export async function getAgenda(
  userId: string,
  tz: string,
  anchorDate: string,
  days: number = AGENDA_DAYS
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
  for (const date of dates) byDay[date] = buildTimeline(items, events, tz, date);

  const strip = dates.map((date) => {
    const rows = byDay[date];
    return {
      date,
      taskCount: rows.filter((r) => r.type === "item").length,
      eventCount: rows.filter((r) => r.type === "event").length,
    };
  });

  const categories = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? DEFAULT_CATEGORY_COLOR,
  }));

  return { priorityCounts, strip, byDay, categories };
}
