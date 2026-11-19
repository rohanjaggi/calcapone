import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

type User = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

function devBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "1";
}

async function devBypassUser(): Promise<User | null> {
  const raw = process.env.TELEGRAM_USER_ID;
  if (!raw) return null;
  try {
    const telegramId = BigInt(raw);
    return prisma.user.upsert({
      where: { telegramId },
      update: {},
      create: { telegramId, telegramUsername: "dev", timezone: "Asia/Singapore" },
    });
  } catch {
    return null;
  }
}

/**
 * The signed-in user for the current request (pages, server actions), or null.
 * Reads the session cookie; in local development `AUTH_DEV_BYPASS=1` logs in as TELEGRAM_USER_ID.
 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return user;
  }
  if (devBypassEnabled()) return devBypassUser();
  return null;
}

/** Like getCurrentUser but redirects to /login when signed out. Safe in pages and server actions. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
