"use server";

import { createTodo, updateTodo, deleteTodo } from "@/lib/services/todo";
import { getOrCreateDevUser } from "@/lib/dev-user";
import { createCategory, listCategories } from "@/lib/services/category";
import type { TodoStatus, Priority } from "@/generated/prisma/enums";

export async function toggleTodoStatus(todoId: string, newStatus: TodoStatus) {
  const user = await getOrCreateDevUser();
  await updateTodo(todoId, user.id, { status: newStatus });
}

export async function addTodo(data: {
  title: string;
  priority: Priority;
  categoryId?: string | null;
  dueDate?: string | null;
}) {
  const user = await getOrCreateDevUser();
  await createTodo({
    userId: user.id,
    title: data.title,
    priority: data.priority,
    categoryId: data.categoryId ?? null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
  });
}

export async function removeTodo(todoId: string) {
  const user = await getOrCreateDevUser();
  await deleteTodo(todoId, user.id);
}

export async function addCategory(name: string, color: string) {
  const user = await getOrCreateDevUser();
  return createCategory({ userId: user.id, name, color });
}

export async function getCategories() {
  const user = await getOrCreateDevUser();
  const cats = await listCategories(user.id);
  return cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}
