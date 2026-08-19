import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cal_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (at least 32 characters; generate with `openssl rand -hex 32`)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

/** Returns the user id in a valid session token, or null. Never throws. */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Telegram Web and Telegram Desktop render a Mini App inside a cross-site iframe, where a
 * `SameSite=Lax` cookie is never sent back — the session would be set on login and then
 * ignored on every subsequent request, looping the user back to /login. `SameSite=None`
 * requires `Secure`, which browsers only honour over HTTPS, so plain-HTTP local development
 * keeps `Lax` (first-party there anyway).
 */
export function sessionCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
