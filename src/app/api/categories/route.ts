import { NextRequest, NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/services/category";
import { getRequestUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const categories = await listCategories(userId);
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const body = await request.json();
  if (typeof body?.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const category = await createCategory({
    userId,
    name: body.name.trim(),
    color: typeof body.color === "string" ? body.color : null,
  });
  return NextResponse.json(category, { status: 201 });
}
