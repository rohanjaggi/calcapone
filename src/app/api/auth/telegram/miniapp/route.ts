import { NextRequest, NextResponse } from "next/server";
import { validateInitData, displayNameFor } from "@/lib/telegram-auth";
import { findOrCreateUser } from "@/lib/services/user";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

// Telegram Mini App: the login page POSTs window.Telegram.WebApp.initData here.
export async function POST(request: NextRequest) {
  let initData = "";
  try {
    const body = await request.json();
    initData = typeof body?.initData === "string" ? body.initData : "";
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const telegramUser = validateInitData(initData);
  if (!telegramUser) {
    return NextResponse.json({ error: "Invalid Telegram data" }, { status: 401 });
  }

  // The Telegram data is fine past this point, so a failure here is ours (typically the
  // database being unreachable, e.g. a paused Supabase project). Say so with a 503 so the
  // login screen can tell the user to retry instead of to reopen the app.
  let token: string;
  try {
    const user = await findOrCreateUser(BigInt(telegramUser.id), displayNameFor(telegramUser));
    token = await createSessionToken(user.id);
  } catch (error) {
    console.error("[auth] mini app sign-in failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
