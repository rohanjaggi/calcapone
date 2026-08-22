import { requireUser } from "@/lib/auth";
import { listItems } from "@/lib/services/item";
import { todayInTz } from "@/lib/tz";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SearchDialog } from "@/components/search/search-dialog";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();

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
        timezone={user.timezone}
        today={todayInTz(user.timezone)}
      />
    </>
  );
}
