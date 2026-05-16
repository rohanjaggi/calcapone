import { NextRequest, NextResponse } from "next/server";
import { updateTodo, deleteTodo } from "@/lib/services/todo";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const { id } = await params;
  const body = await request.json();
  const todo = await updateTodo(id, userId, body);
  return NextResponse.json(todo);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const { id } = await params;
  await deleteTodo(id, userId);
  return NextResponse.json({ ok: true });
}
