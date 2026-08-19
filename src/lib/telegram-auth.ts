import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { findOrCreateUser } from "@/lib/services/user";

export type TelegramAuthUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

const MINI_APP_MAX_AGE_SECONDS = 24 * 60 * 60; // initData is fixed at open time; be generous

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length > 0 && ba.length === bb.length && timingSafeEqual(ba, bb);
}

function isFresh(authDate: string | undefined, maxAgeSeconds: number, now = Date.now()): boolean {
  const ts = Number(authDate);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const ageSeconds = now / 1000 - ts;
  return ageSeconds >= -300 && ageSeconds <= maxAgeSeconds; // allow small clock skew
}

function buildCheckString(entries: Array<[string, string]>): string {
  return entries
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/**
 * Validate Telegram Mini App `initData` (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the parsed user on success, null otherwise.
 */
export function validateInitData(initData: string, now = Date.now()): TelegramAuthUser | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  if (!isFresh(params.get("auth_date") ?? undefined, MINI_APP_MAX_AGE_SECONDS, now)) return null;

  const checkString = buildCheckString(Array.from(params.entries()));
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const computed = createHmac("sha256", secretKey).update(checkString).digest("hex");
  if (!safeEqualHex(computed, hash)) return null;

  const userField = params.get("user");
  if (!userField) return null;
  try {
    const user = JSON.parse(userField) as TelegramAuthUser;
    return typeof user?.id === "number" ? user : null;
  } catch {
    return null;
  }
}

export function displayNameFor(user: TelegramAuthUser): string {
  return user.username ?? user.first_name ?? "User";
}

/** Legacy header-based auth for the JSON API (Telegram Mini App clients sending `x-telegram-init-data`). */
export async function authenticateRequest(request: NextRequest) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) return null;
  const telegramUser = validateInitData(initData);
  if (!telegramUser) return null;
  try {
    return await findOrCreateUser(BigInt(telegramUser.id), displayNameFor(telegramUser));
  } catch {
    return null;
  }
}
