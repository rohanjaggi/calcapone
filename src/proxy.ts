import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Defense in depth: send signed-out browsers to /login. The authoritative check is
 * `requireUser()` in every page and server action.
 *
 * Only plain GET navigations are redirected — server-action POSTs carry a `next-action`
 * header and must reach the action (it handles the redirect itself); a 3xx here would
 * break the action client.
 */
export async function proxy(request: NextRequest) {
  if (request.method !== "GET" || request.headers.get("next-action")) return NextResponse.next();
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "1") return NextResponse.next();

  const userId = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except: API routes, the login page, Next internals, and static assets.
    "/((?!api/|login|how-to-use|_next/|icon\\.png|logo\\.png|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
