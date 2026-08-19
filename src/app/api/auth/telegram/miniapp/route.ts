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

  const user = await findOrCreateUser(BigInt(telegramUser.id), displayNameFor(telegramUser));
  const token = await createSessionToken(user.id);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
