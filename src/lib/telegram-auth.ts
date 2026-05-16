import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { findOrCreateUser } from "@/lib/services/user";

function validateInitData(initData: string): Record<string, string> | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const entries = Array.from(params.entries());
  entries.sort(([a], [b]) => a.localeCompare(b));
  const checkString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const computedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (computedHash !== hash) return null;

  const data: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    data[k] = v;
  }
  data.hash = hash;
  return data;
}

export async function authenticateRequest(request: NextRequest) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) return null;

  const validated = validateInitData(initData);
  if (!validated) return null;

  const userField = validated.user;
  if (!userField) return null;

  try {
    const telegramUser = JSON.parse(userField);
    const user = await findOrCreateUser(
      BigInt(telegramUser.id),
      telegramUser.username ?? telegramUser.first_name ?? "User"
    );
    return user;
  } catch {
    return null;
  }
}
