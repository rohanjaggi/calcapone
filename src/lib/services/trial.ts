import { prisma } from "@/lib/prisma";
import { todayInTz } from "@/lib/tz";

export const DEFAULT_TRIAL_DAILY_LIMIT = 30;

export function getTrialDailyLimit(): number {
  const raw = Number(process.env.TRIAL_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TRIAL_DAILY_LIMIT;
}

export function isOwner(telegramId: bigint): boolean {
  const owner = process.env.TELEGRAM_USER_ID;
  if (!owner) return false;
  try {
    return BigInt(owner) === telegramId;
  } catch {
    return false;
  }
}

type TrialUser = {
  id: string;
  telegramId: bigint;
  timezone: string;
  aiApiKey: string | null;
  aiCallsDate: string | null;
  aiCallsCount: number;
};

export type TrialCheck =
  | { allowed: true; remaining: number | null }
  | { allowed: false; limit: number };

/**
 * Users on the shared default key ("trial") get `TRIAL_DAILY_LIMIT` AI calls per
 * day (in their own timezone). The owner and BYOK users are exempt.
 * Atomically consumes one call when allowed.
 */
export async function checkAndConsumeTrialQuota(user: TrialUser, now: Date = new Date()): Promise<TrialCheck> {
  if (user.aiApiKey || isOwner(user.telegramId)) return { allowed: true, remaining: null };

  const limit = getTrialDailyLimit();
  const today = todayInTz(user.timezone, now);

  if (user.aiCallsDate !== today) {
    // New day (or first use): reset the counter to 1 for today.
    await prisma.user.update({
      where: { id: user.id },
      data: { aiCallsDate: today, aiCallsCount: 1 },
    });
    return { allowed: true, remaining: limit - 1 };
  }

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, aiCallsDate: today, aiCallsCount: { lt: limit } },
    data: { aiCallsCount: { increment: 1 } },
  });
  if (claimed.count === 1) {
    return { allowed: true, remaining: Math.max(0, limit - (user.aiCallsCount + 1)) };
  }
  return { allowed: false, limit };
}

/**
 * The gate above charges one call up front, because it has to decide before any provider is
 * hit. A single message is really up to `DEFAULT_MAX_STEPS` calls though, and an image costs
 * far more per call than text — so the rest is settled once the run is over. Going over the
 * limit mid-message is allowed; the next message's gate catches it. Guarded on today's date so
 * a run spanning midnight can't charge the new day for yesterday's work.
 */
export async function chargeExtraTrialCalls(
  user: TrialUser,
  extra: number,
  now: Date = new Date()
): Promise<void> {
  if (user.aiApiKey || isOwner(user.telegramId)) return;
  if (!Number.isFinite(extra) || extra <= 0) return;

  const today = todayInTz(user.timezone, now);
  await prisma.user.updateMany({
    where: { id: user.id, aiCallsDate: today },
    data: { aiCallsCount: { increment: Math.floor(extra) } },
  });
}

/** An image costs several times a text call on the same budget, so it carries a surcharge. */
export const IMAGE_CALL_SURCHARGE = 2;

export function trialLimitMessage(limit: number): string {
  return `You've used today's ${limit} free trial messages. Add your own API key in Settings to keep going, or try again tomorrow.`;
}
