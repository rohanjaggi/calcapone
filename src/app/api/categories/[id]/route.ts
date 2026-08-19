import { NextRequest, NextResponse } from "next/server";
import { deleteCategory } from "@/lib/services/category";
import { getRequestUser } from "@/lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const { id } = await params;
  await deleteCategory(id, userId);
  return NextResponse.json({ ok: true });
}
