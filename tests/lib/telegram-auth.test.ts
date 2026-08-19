import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { validateInitData } from "@/lib/telegram-auth";

const TOKEN = "123456:ABC-DEF_test_token";

function signInitData(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));
  return params.toString();
}

const NOW = Date.parse("2026-08-20T10:00:00Z");
const nowSec = String(Math.floor(NOW / 1000));

describe("telegram-auth", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });

  it("accepts valid Mini App initData and returns the user", () => {
    const initData = signInitData({ auth_date: nowSec, query_id: "q", user: JSON.stringify({ id: 42, first_name: "Ro", username: "ro" }) });
    expect(validateInitData(initData, NOW)).toEqual({ id: 42, first_name: "Ro", username: "ro" });
  });

  it("rejects tampered, stale, or missing-hash initData", () => {
    const good = signInitData({ auth_date: nowSec, user: JSON.stringify({ id: 42 }) });
    expect(validateInitData(good.replace("%22id%22%3A42", "%22id%22%3A43"), NOW)).toBeNull();
    const stale = signInitData({ auth_date: String(Number(nowSec) - 2 * 24 * 3600), user: JSON.stringify({ id: 42 }) });
    expect(validateInitData(stale, NOW)).toBeNull();
    expect(validateInitData("user=%7B%7D&auth_date=1", NOW)).toBeNull();
    expect(validateInitData("", NOW)).toBeNull();
  });

  it("rejects initData when the bot token is unset", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const initData = signInitData({ auth_date: nowSec, user: JSON.stringify({ id: 42 }) });
    expect(validateInitData(initData, NOW)).toBeNull();
  });

});
