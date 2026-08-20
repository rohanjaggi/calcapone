import { updateItem, snoozeReminder, getItem } from "@/lib/services/item";
import { undoById } from "@/lib/services/action-log";
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
const UNDO = "u";
const PICK = "p";

/** Snooze target for the "tomorrow" button, in the user's own morning. */
const TOMORROW_HOUR = 9;

/** 10 minutes is the snooze people actually reach for; only offering the hour mark meant they snoozed twice. */
export function reminderKeyboard(itemId: string): InlineKeyboard {
  return [
    [
      { text: "✅ Done", callback_data: `${DONE}:${itemId}` },
      { text: "⏰ 10m", callback_data: `${SNOOZE}:${itemId}:10` },
      { text: "⏰ 1h", callback_data: `${SNOOZE}:${itemId}:60` },
    ],
    [{ text: "🌙 Tomorrow", callback_data: `${TOMORROW}:${itemId}` }],
  ];
}

/** Escalation alerts are about a due *date*, so snoozing a clock time makes no sense there. */
export function doneOnlyKeyboard(itemId: string): InlineKeyboard {
  return [[{ text: "✅ Done", callback_data: `${DONE}:${itemId}` }]];
}

/** Reversing a just-taken action is a single choice — one button, not a menu. */
export function undoKeyboard(actionId: string): InlineKeyboard {
  return [[{ text: "↩️ Undo", callback_data: `${UNDO}:${actionId}` }]];
}

/** Five is already a lot of buttons to scan on a phone; beyond that the picker should narrow the search instead. */
const MAX_CANDIDATES = 5;
/** Long enough to disambiguate two similar titles, short enough to stay one line on a phone keyboard row. */
const MAX_LABEL_LENGTH = 40;

/**
 * A stray newline in a title (copy-pasted from somewhere) would otherwise render as a
 * literal line break baked into the button, which Telegram shows as mangled whitespace.
 */
function truncateLabel(title: string): string {
  const flat = title.replace(/[\r\n]+/g, "");
  return flat.length > MAX_LABEL_LENGTH ? `${flat.slice(0, MAX_LABEL_LENGTH - 1)}…` : flat;
}

/**
 * One button per disambiguation candidate. Addressed by index rather than the candidate's
 * own id: the ids already live on the `PendingAction` row, so the button only has to say
 * which position was picked, keeping the payload uuid-length regardless of what the real
 * ids look like.
 */
export function chooseKeyboard(
  pendingId: string,
  candidates: Array<{ id: string; title: string }>
): InlineKeyboard {
  return candidates
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => [
      { text: truncateLabel(candidate.title), callback_data: `${PICK}:${pendingId}:${index}` },
    ]);
}

export type CallbackOutcome = {
  /** Replacement text for the original message, so the reminder becomes its own receipt. */
  text: string;
  /** Short confirmation shown in Telegram's toast. */
  toast: string;
  /** Buttons for the rewritten message. Omitted means "strip them". */
  keyboard?: InlineKeyboard;
};

/** Undo can touch Google Calendar, which needs the token — so callers hand over the whole user, not just an id. */
export type CallbackUser = {
  id: string;
  timezone: string;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
};

export type ParsedCallback =
  | { action: "done"; itemId: string }
  | { action: "snooze"; itemId: string; minutes: number }
  | { action: "tomorrow"; itemId: string }
  | { action: "undo"; actionId: string }
  | { action: "pick"; pendingId: string; index: number };

export function parseCallbackData(data: string): ParsedCallback | null {
  const parts = data.split(":");
  const [verb, id] = parts;
  if (!id) return null;

  if (verb === DONE) return { action: "done", itemId: id };
  if (verb === TOMORROW) return { action: "tomorrow", itemId: id };
  if (verb === UNDO) return { action: "undo", actionId: id };

  if (verb === SNOOZE) {
    const minutes = Number(parts[2]);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return { action: "snooze", itemId: id, minutes };
  }

  if (verb === PICK) {
    // A plain digit-string check rather than Number() + isInteger(): Number("") is 0 and
    // Number(" 3") is 3, both of which would silently accept a malformed index.
    const indexStr = parts[2];
    if (!indexStr || !/^\d+$/.test(indexStr)) return null;
    return { action: "pick", pendingId: id, index: Number(indexStr) };
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
 * Apply an already-parsed button press.
 *
 * Returns null for `pick`, which is deliberately NOT handled here: re-running a parked tool
 * call needs the tool runtime, and the webhook owns that. Every other action is self-contained.
 */
export async function handleCallback(
  parsed: ParsedCallback,
  user: CallbackUser,
  now: Date = new Date()
): Promise<CallbackOutcome | null> {
  if (parsed.action === "pick") return null;

  if (parsed.action === "undo") {
    const result = await undoById(parsed.actionId, user, now);
    if (result.ok) return { text: `↩️ Undid: ${result.summary}`, toast: "Undone" };
    if (result.reason === "none") return { text: "Nothing to undo here.", toast: "Already undone" };
    return { text: "I couldn't undo that — it may have changed since.", toast: "Undo failed" };
  }

  const item = await getItem(parsed.itemId, user.id);
  if (!item) return { text: "That item no longer exists.", toast: "Item not found" };

  if (parsed.action === "done") {
    await updateItem(item.id, user.id, { status: "done" as ItemStatus });
    return { text: `✅ ${b(item.title)} — done`, toast: "Marked done" };
  }

  const remindAt =
    parsed.action === "tomorrow"
      ? tomorrowMorning(user.timezone, now)
      : new Date(now.getTime() + parsed.minutes * 60_000);

  await snoozeReminder(item.id, user.id, remindAt);

  const when =
    formatDateInTz(remindAt, user.timezone) === formatDateInTz(now, user.timezone)
      ? formatHHmmInTz(remindAt, user.timezone)
      : `${formatDateInTz(remindAt, user.timezone)} ${formatHHmmInTz(remindAt, user.timezone)}`;

  return { text: `😴 ${b(item.title)} — back at ${esc(when)}`, toast: `Snoozed until ${when}` };
}
