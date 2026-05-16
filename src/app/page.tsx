import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getOrCreateDevUser();
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
  }));

  return <DashboardClient userName={user.telegramUsername} items={serializedItems} eventCount={0} />;
}
