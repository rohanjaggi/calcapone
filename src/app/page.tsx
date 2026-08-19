import { requireUser } from "@/lib/auth";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SearchDialog } from "@/components/search/search-dialog";

export const dynamic = "force-dynamic";

/**
 * Today's event count, as a promise. Google costs a network round-trip the database read
 * shouldn't have to wait behind, and the dashboard shouldn't have to wait for at all — the
 * count streams into the stats row once it lands. Never rejects: a calendar failure just
 * leaves the count at zero, as it did when this blocked the render.
 */
function todayEventCount(user: { googleRefreshToken: string | null; googleCalendarId: string | null; timezone: string }): Promise<number> {
  if (!user.googleRefreshToken) return Promise.resolve(0);

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(now);
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = now.toLocaleString("en-US", { timeZone: user.timezone });
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
  const todayStart = new Date(new Date(`${todayStr}T00:00:00Z`).getTime() - offsetMs);
  const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);

  return getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", todayStart, todayEnd)
    .then((events) => events.length)
    .catch(() => 0);
}

export default async function Dashboard() {
  const user = await requireUser();

  const eventCountPromise = todayEventCount(user);
  const items = await listItems(user.id);

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
        eventCountPromise={eventCountPromise}
        aiSuggestionEnabled={user.aiSuggestionEnabled}
      />
    </>
  );
}
