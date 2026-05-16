import { getOrCreateDevUser } from "@/lib/dev-user";
import { listTodos } from "@/lib/services/todo";
import { listCategories } from "@/lib/services/category";
import { TodosClient } from "@/components/todos/todos-client";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const user = await getOrCreateDevUser();

  const [todos, categories] = await Promise.all([
    listTodos(user.id),
    listCategories(user.id),
  ]);

  const serializedTodos = todos.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    category: t.category ? { name: t.category.name, color: t.category.color ?? "#92785C" } : null,
    dueDate: t.dueDate?.toISOString() ?? null,
  }));

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? "#92785C",
  }));

  return (
    <TodosClient todos={serializedTodos} categories={serializedCategories} />
  );
}
