import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { appUrl } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(appUrl("/login", request), { status: 303 });
  // Same attributes as when it was set, or the browser won't treat this as the same cookie.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
