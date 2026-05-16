import { NextRequest, NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/services/category";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const categories = await listCategories(userId);
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const body = await request.json();
  const category = await createCategory({ userId, ...body });
  return NextResponse.json(category, { status: 201 });
}
