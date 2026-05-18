import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { TodosClient } from "@/components/todos/todos-client";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const user = await getOrCreateDevUser();
  const [items, categories] = await Promise.all([
    listItems(user.id),
    listCategories(user.id),
  ]);

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

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? "#92785C",
  }));

  return <TodosClient items={serializedItems} categories={serializedCategories} />;
}
