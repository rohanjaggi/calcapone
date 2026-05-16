import { NextRequest, NextResponse } from "next/server";
import { updateItem, deleteItem } from "@/lib/services/item";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const item = await updateItem(id, user.id, body);
  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteItem(id, user.id);
  return NextResponse.json({ ok: true });
}
