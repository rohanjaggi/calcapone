import { prisma } from "@/lib/prisma";
import type { Priority, TodoStatus } from "@/generated/prisma/enums";

type CreateTodoInput = {
  userId: string;
  title: string;
  description?: string | null;
  priority?: Priority;
  categoryId?: string | null;
  dueDate?: Date | null;
};

type TodoFilters = {
  status?: TodoStatus;
  categoryId?: string;
  priority?: Priority;
};

type UpdateTodoInput = {
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: Priority;
  categoryId?: string | null;
  dueDate?: Date | null;
};

export async function createTodo(data: CreateTodoInput) {
  return prisma.todo.create({
    data,
    include: { category: true },
  });
}

export async function listTodos(userId: string, filters: TodoFilters = {}) {
  return prisma.todo.findMany({
    where: { userId, ...filters },
    include: { category: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateTodo(id: string, userId: string, data: UpdateTodoInput) {
  return prisma.todo.update({
    where: { id, userId },
    data,
    include: { category: true },
  });
}

export async function deleteTodo(id: string, userId: string) {
  return prisma.todo.delete({ where: { id, userId } });
}
