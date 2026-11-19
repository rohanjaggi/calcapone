import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/services/cron-utils";

/**
 * Daily Vercel Cron (see vercel.json). Supabase pauses free projects after a week without
 * activity, and GitHub silently disables scheduled workflows after 60 days without a push,
 * so the GitHub backstop alone can't be trusted to keep the database awake. Vercel Cron
 * has no such inactivity cut-off; it sends `Authorization: Bearer $CRON_SECRET` itself.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const users = await prisma.user.count();
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    console.error("[cron] keepalive: database unreachable:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "database unreachable" }, { status: 503 });
  }
}
