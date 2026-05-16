import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { CalendarClient } from "@/components/calendar/calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getOrCreateDevUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const items = await listItems(user.id);

  let googleEvents: Array<{ id: string; title: string; startTime: string; endTime: string }> = [];
  if (user.googleRefreshToken) {
    try {
      googleEvents = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", monthStart, monthEnd);
    } catch {}
  }

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
  }));

  return (
    <CalendarClient items={serializedItems} googleEvents={googleEvents} hasGoogleCalendar={!!user.googleRefreshToken} />
  );
}
