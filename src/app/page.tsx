import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SearchDialog } from "@/components/search/search-dialog";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getOrCreateDevUser();
  const items = await listItems(user.id);

  let eventCount = 0;
  if (user.googleRefreshToken) {
    try {
      const now = new Date();
      const todayStart = new Date(now.toLocaleString("en-US", { timeZone: user.timezone }));
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);
      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        todayStart,
        todayEnd
      );
      eventCount = events.length;
    } catch {
      // calendar fetch failure is non-fatal
    }
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
    googleEventId: item.googleEventId ?? null,
  }));

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <SearchDialog />
      </div>
      <DashboardClient
        userName={user.telegramUsername}
        items={serializedItems}
        eventCount={eventCount}
        aiSuggestionEnabled={user.aiSuggestionEnabled}
      />
    </>
  );
}
