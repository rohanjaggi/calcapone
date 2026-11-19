import { requireUser } from "@/lib/auth";
import { listItemsForBoard, toClientItem } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { TodosClient } from "@/components/todos/todos-client";
import { SkyStyle } from "@/components/sky/sky-style";
import { todayInTz } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const user = await requireUser();
  const [items, categories] = await Promise.all([
    listItemsForBoard(user.id, { days: 14, take: 50 }),
    listCategories(user.id),
  ]);

  const serializedItems = items.map((item) => toClientItem(item, user.timezone));

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? "#92785C",
  }));

  return (
    <>
      <SkyStyle timezone={user.timezone} />
      <TodosClient items={serializedItems} categories={serializedCategories} today={todayInTz(user.timezone)} />
    </>
  );
}
