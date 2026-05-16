import { getOrCreateDevUser } from "@/lib/dev-user";
import { listTodos } from "@/lib/services/todo";
import { listReminders } from "@/lib/services/reminder";
import { getEvents } from "@/lib/services/calendar";
import { CalendarClient } from "@/components/calendar/calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getOrCreateDevUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const [todos, reminders] = await Promise.all([
    listTodos(user.id),
    listReminders(user.id, { status: "pending" }),
  ]);

  let googleEvents: Array<{ id: string; title: string; startTime: string; endTime: string }> = [];
  if (user.googleRefreshToken) {
    try {
      googleEvents = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        monthStart,
        monthEnd
      );
    } catch {
      // Token may be expired or revoked — fail silently, show connect prompt
    }
  }

  const serializedTodos = todos.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    category: t.category ? { name: t.category.name, color: t.category.color ?? "#92785C" } : null,
    dueDate: t.dueDate?.toISOString() ?? null,
  }));

  const serializedReminders = reminders.map((r) => ({
    id: r.id,
    message: r.message,
    remindAt: r.remindAt.toISOString(),
    recurring: r.recurring,
    status: r.status,
    category: r.category ? { name: r.category.name, color: r.category.color ?? "#B87D6B" } : null,
  }));

  return (
    <CalendarClient
      todos={serializedTodos}
      reminders={serializedReminders}
      googleEvents={googleEvents}
      hasGoogleCalendar={!!user.googleRefreshToken}
    />
  );
}
