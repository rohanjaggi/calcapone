import { NextRequest, NextResponse } from "next/server";
import { createTodo, listTodos } from "@/lib/services/todo";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "pending" | "in_progress" | "done" | null;
  const categoryId = url.searchParams.get("categoryId");

  const todos = await listTodos(userId, {
    ...(status && { status }),
    ...(categoryId && { categoryId }),
  });
  return NextResponse.json(todos);
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const body = await request.json();
  const todo = await createTodo({ userId, ...body });
  return NextResponse.json(todo, { status: 201 });
}
