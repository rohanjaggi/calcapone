import { requireUser } from "@/lib/auth";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SearchDialog } from "@/components/search/search-dialog";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const items = await listItems(user.id);

  let eventCount = 0;
  if (user.googleRefreshToken) {
    try {
      const now = new Date();
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(now);
      const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
      const tzStr = now.toLocaleString("en-US", { timeZone: user.timezone });
      const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
      const todayStart = new Date(new Date(`${todayStr}T00:00:00Z`).getTime() - offsetMs);
      const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
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
