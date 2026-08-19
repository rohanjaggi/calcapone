import { sendMessageSafe, esc, b } from "@/lib/services/telegram";

/**
 * Tell the operator when something breaks.
 *
 * At this scale there is no on-call rotation and nobody reads Vercel logs — a failure that
 * only reaches `console.error` is a failure nobody learns about until a deadline is missed.
 * Routing unexpected errors to the owner's own chat turns every silent fault into a ping.
 */

/** Same fault, same cooldown — a failing dependency shouldn't turn into a chat flood. */
const COOLDOWN_MS = 10 * 60 * 1000;
const lastSent = new Map<string, number>();

function ownerChatId(): bigint | null {
  const raw = process.env.TELEGRAM_USER_ID;
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/** Test seam: forget the cooldown window. */
export function resetAlertCooldown(): void {
  lastSent.clear();
}

/**
 * DM the owner about an unexpected failure. Never throws and never blocks the caller's own
 * error handling — a broken alert path must not make the original fault worse.
 *
 * `context` doubles as the dedupe key, so keep it stable per call site rather than
 * interpolating ids into it.
 */
export async function notifyOwner(context: string, error: unknown, now = Date.now()): Promise<void> {
  const chatId = ownerChatId();
  if (!chatId) return;

  const previous = lastSent.get(context);
  if (previous !== undefined && now - previous < COOLDOWN_MS) return;
  lastSent.set(context, now);

  const detail = error instanceof Error ? error.message : String(error);
  await sendMessageSafe(chatId, `${b("Calcapone fault")}\n${esc(context)}\n\n${esc(detail.slice(0, 500))}`);
}
