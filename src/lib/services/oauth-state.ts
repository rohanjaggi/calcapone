import { prisma } from "@/lib/prisma";
import type { OAuthStatePayload } from "@/lib/services/calendar";

/** Record an in-flight OAuth flow so its state can only be redeemed once. */
export async function rememberOAuthState(payload: OAuthStatePayload): Promise<void> {
  await prisma.oAuthState.create({
    data: { nonce: payload.nonce, userId: payload.userId, expiresAt: payload.expiresAt },
  });
}

/**
 * Redeem a nonce. Returns true only for the first caller — `deleteMany` reports how many rows
 * it removed, so a replayed callback URL (or two concurrent ones) can't both succeed.
 * Expired rows are cleaned up by the reminders cron's prune step.
 */
export async function consumeOAuthState(nonce: string, userId: string, now = new Date()): Promise<boolean> {
  const result = await prisma.oAuthState.deleteMany({
    where: { nonce, userId, expiresAt: { gt: now } },
  });
  return result.count === 1;
}
