import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTodo, listTodos, updateTodo, deleteTodo } from "@/lib/services/todo";

const mockPrisma = vi.hoisted(() => ({
  todo: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("TodoService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a todo with defaults", async () => {
    const input = { userId: "u1", title: "Buy milk" };
    mockPrisma.todo.create.mockResolvedValue({ id: "t1", status: "pending", priority: "medium", ...input });
    const result = await createTodo(input);
    expect(result.title).toBe("Buy milk");
    expect(mockPrisma.todo.create).toHaveBeenCalledWith({
      data: input,
      include: { category: true },
    });
  });

  it("lists todos with filters", async () => {
    mockPrisma.todo.findMany.mockResolvedValue([]);
    await listTodos("u1", { status: "pending", categoryId: "c1" });
    expect(mockPrisma.todo.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "pending", categoryId: "c1" },
      include: { category: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  });

  it("updates a todo", async () => {
    mockPrisma.todo.update.mockResolvedValue({ id: "t1", status: "done" });
    await updateTodo("t1", "u1", { status: "done" });
    expect(mockPrisma.todo.update).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1" },
      data: { status: "done" },
      include: { category: true },
    });
  });

  it("deletes a todo", async () => {
    mockPrisma.todo.delete.mockResolvedValue({ id: "t1" });
    await deleteTodo("t1", "u1");
    expect(mockPrisma.todo.delete).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1" },
    });
  });
});
