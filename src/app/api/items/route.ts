import { NextRequest, NextResponse } from "next/server";
import { createItem, listItems } from "@/lib/services/item";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "pending" | "in_progress" | "done" | null;
  const categoryId = url.searchParams.get("categoryId");

  const items = await listItems(user.id, {
    ...(status && { status }),
    ...(categoryId && { categoryId }),
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const item = await createItem({
    userId: user.id,
    categoryId: body.categoryId,
    title: body.title,
    description: body.description ?? null,
    priority: body.priority ?? "medium",
    dueDate: body.dueDate ?? null,
    dueTime: body.dueTime ?? null,
    remindAt: body.remindAt ? new Date(body.remindAt) : null,
    recurring: body.recurring ?? "none",
    googleEventId: body.googleEventId ?? null,
  });
  return NextResponse.json(item, { status: 201 });
}
