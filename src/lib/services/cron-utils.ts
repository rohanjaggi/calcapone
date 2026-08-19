import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Priority } from "@/generated/prisma/enums";

/** Bearer-token check for cron/admin endpoints. Fails closed when CRON_SECRET is unset. */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type CronUser = Awaited<ReturnType<typeof prisma.user.findFirst>> & {};

type CronJobOptions = {
  filter: Record<string, unknown>;
  shouldRun: (user: CronUser, now: Date) => boolean;
  handler: (user: CronUser, now: Date) => Promise<void>;
};

export async function runCronJob(request: NextRequest, options: CronJobOptions) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const users = await prisma.user.findMany({ where: options.filter });

  let sent = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.telegramId) continue;
    if (!options.shouldRun(user, now)) continue;

    try {
      await options.handler(user, now);
      sent++;
    } catch (error) {
      console.error(`[cron] handler failed for user ${user.id}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  return NextResponse.json({ sent, errors });
}

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

export function shouldNotify(
  user: { quietStart: string | null; quietEnd: string | null; notifyMinPriority: Priority; timezone: string },
  priority: Priority,
  now: Date
): boolean {
  if (PRIORITY_RANK[priority] < PRIORITY_RANK[user.notifyMinPriority]) {
    return false;
  }

  if (!user.quietStart || !user.quietEnd) return true;

  const userTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: user.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const current = timeToMinutes(userTime);
  const start = timeToMinutes(user.quietStart);
  const end = timeToMinutes(user.quietEnd);

  if (start <= end) {
    return current < start || current >= end;
  }
  // Wraps midnight (e.g., 23:00 - 07:00)
  return current >= end && current < start;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
