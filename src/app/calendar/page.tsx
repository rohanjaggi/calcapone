import { requireUser } from "@/lib/auth";
import { listItemsForBoard } from "@/lib/services/item";
import { getEvents, CalendarAuthError } from "@/lib/services/calendar";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";
import { listCategories } from "@/lib/services/category";
import { CalendarClient, type GoogleCalendarFeed } from "@/components/calendar/calendar-client";

export const dynamic = "force-dynamic";

/**
 * This month and next from Google, as a promise. It's a network round-trip the local tasks
 * shouldn't wait behind: the grid renders from the database immediately and the events fill
 * in when they land. Never rejects — `connected: false` is how a dead grant comes back, and
 * a transient failure just yields no events.
 */
function monthEvents(
  user: { id: string; googleRefreshToken: string | null; googleCalendarId: string | null; timezone: string },
  monthStart: Date,
  monthEnd: Date
): Promise<GoogleCalendarFeed> {
  if (!user.googleRefreshToken) return Promise.resolve({ events: [], connected: false });

  return getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", monthStart, monthEnd, user.timezone)
    .then((events) => ({
      events: events.map((e) => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime })),
      connected: true,
    }))
    .catch(async (error) => {
      if (error instanceof CalendarAuthError) {
        await markCalendarDisconnected(user.id);
        return { events: [], connected: false };
      }
      console.error("[calendar] event fetch failed:", error instanceof Error ? error.message : error);
      return { events: [], connected: true };
    });
}

export default async function CalendarPage() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const googleFeedPromise = monthEvents(user, monthStart, monthEnd);

  const [items, categories] = await Promise.all([listItemsForBoard(user.id, { days: 14, take: 50 }), listCategories(user.id)]);

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? "#92785C",
  }));

  const serializedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: item.category.id, name: item.category.name, color: item.category.color ?? "#92785C" },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
    googleEventId: item.googleEventId ?? null,
  }));

  return (
    <CalendarClient
      items={serializedItems}
      googleFeedPromise={googleFeedPromise}
      hasGoogleCalendar={!!user.googleRefreshToken}
      categories={serializedCategories}
    />
  );
}
