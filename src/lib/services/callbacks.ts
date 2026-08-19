import { updateItem, snoozeReminder, getItem } from "@/lib/services/item";
import { esc, b, type InlineKeyboard } from "@/lib/services/telegram";
import { formatDateInTz, formatHHmmInTz, startOfDayInTz } from "@/lib/tz";
import type { ItemStatus } from "@/generated/prisma/enums";

/**
 * Button actions for a fired reminder.
 *
 * Dismissing a reminder used to mean typing a whole sentence back at the bot, which is
 * exactly the moment a user is least willing to type. `callback_data` is capped at 64
 * bytes, so the verbs are single letters and the id (a 36-char uuid) carries the rest.
 */

const DONE = "d";
const SNOOZE = "s";
const TOMORROW = "t";

/** Snooze target for the "tomorrow" button, in the user's own morning. */
const TOMORROW_HOUR = 9;

export function reminderKeyboard(itemId: string): InlineKeyboard {
  return [
    [
      { text: "✅ Done", callback_data: `${DONE}:${itemId}` },
      { text: "⏰ 1h", callback_data: `${SNOOZE}:${itemId}:60` },
      { text: "🌙 Tomorrow", callback_data: `${TOMORROW}:${itemId}` },
    ],
  ];
}

/** Escalation alerts are about a due *date*, so snoozing a clock time makes no sense there. */
export function doneOnlyKeyboard(itemId: string): InlineKeyboard {
  return [[{ text: "✅ Done", callback_data: `${DONE}:${itemId}` }]];
}

export type CallbackOutcome = {
  /** Replacement text for the original message, so the reminder becomes its own receipt. */
  text: string;
  /** Short confirmation shown in Telegram's toast. */
  toast: string;
};

type ParsedCallback =
  | { action: "done"; itemId: string }
  | { action: "snooze"; itemId: string; minutes: number }
  | { action: "tomorrow"; itemId: string };

export function parseCallbackData(data: string): ParsedCallback | null {
  const parts = data.split(":");
  const [verb, itemId] = parts;
  if (!itemId) return null;

  if (verb === DONE) return { action: "done", itemId };
  if (verb === TOMORROW) return { action: "tomorrow", itemId };
  if (verb === SNOOZE) {
    const minutes = Number(parts[2]);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return { action: "snooze", itemId, minutes };
  }
  return null;
}

/**
 * Next occurrence of {@link TOMORROW_HOUR} in the user's timezone.
 *
 * Built from the start of tomorrow rather than by adding 24h to now, so the button always
 * lands on a morning regardless of what time the reminder fired.
 */
function tomorrowMorning(tz: string, now: Date): Date {
  const tomorrow = formatDateInTz(new Date(now.getTime() + 86_400_000), tz);
  return new Date(startOfDayInTz(tomorrow, tz).getTime() + TOMORROW_HOUR * 3_600_000);
}

/**
 * Apply a button press. Returns null when the payload is unrecognised or the item is gone,
 * so the caller can acknowledge the press without rewriting the message.
 */
export async function handleCallback(
  data: string,
  userId: string,
  tz: string,
  now: Date = new Date()
): Promise<CallbackOutcome | null> {
  const parsed = parseCallbackData(data);
  if (!parsed) return null;

  const item = await getItem(parsed.itemId, userId);
  if (!item) return { text: "That item no longer exists.", toast: "Item not found" };

  if (parsed.action === "done") {
    await updateItem(item.id, userId, { status: "done" as ItemStatus });
    return { text: `✅ ${b(item.title)} — done`, toast: "Marked done" };
  }

  const remindAt =
    parsed.action === "tomorrow"
      ? tomorrowMorning(tz, now)
      : new Date(now.getTime() + parsed.minutes * 60_000);

  await snoozeReminder(item.id, userId, remindAt);

  const when =
    formatDateInTz(remindAt, tz) === formatDateInTz(now, tz)
      ? formatHHmmInTz(remindAt, tz)
      : `${formatDateInTz(remindAt, tz)} ${formatHHmmInTz(remindAt, tz)}`;

  return { text: `😴 ${b(item.title)} — back at ${esc(when)}`, toast: `Snoozed until ${when}` };
}
