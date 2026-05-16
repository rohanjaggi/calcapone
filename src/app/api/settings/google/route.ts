import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/services/calendar";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const url = getAuthUrl(userId);
  return NextResponse.json({ url });
}
