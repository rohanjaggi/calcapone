import { prisma } from "@/lib/prisma";
import { updateItem } from "@/lib/services/item";
import { updateEvent, CalendarAuthError } from "@/lib/services/calendar";
import { dueWindowToGcal } from "@/lib/services/gcal-window";
import { esc, b, type InlineKeyboard } from "@/lib/services/telegram";
import { formatDateInTz, formatHHmmInTz } from "@/lib/tz";

/**
 * Both sides of a linked item changed since they last agreed.
 *
 * There is no correct automatic answer here — picking silently means one of the two edits the
 * user deliberately made disappears without them ever seeing it. So the sync reports the
 * clash and these two buttons settle it.
 */

const VERB = "c";

export type ConflictSide = "mine" | "google";

export function conflictKeyboard(itemId: string): InlineKeyboard {
  return [
    [
      { text: "📱 Keep mine", callback_data: `${VERB}:${itemId}:m` },
      { text: "📅 Take Google's", callback_data: `${VERB}:${itemId}:g` },
    ],
  ];
}

export function parseConflictData(data: string): { itemId: string; side: ConflictSide } | null {
  const [verb, itemId, side] = data.split(":");
  if (verb !== VERB || !itemId) return null;
  if (side === "m") return { itemId, side: "mine" };
  if (side === "g") return { itemId, side: "google" };
  return null;
}

export type ConflictUser = {
  id: string;
  timezone: string;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
};

export type ConflictResolution = { ok: true; text: string; toast: string } | { ok: false; reason: string };

/**
 * Settle one conflict by making the losing side match the winner, then marking the pair as
 * agreed so the next sync sees no clash.
 */
export async function resolveConflict(
  itemId: string,
  side: ConflictSide,
  user: ConflictUser,
  now: Date = new Date()
): Promise<ConflictResolution> {
  const item = await prisma.item.findFirst({ where: { id: itemId, userId: user.id } });
  if (!item || !item.googleEventId) return { ok: false, reason: "That item is no longer linked to a calendar event." };

  const calendarId = user.googleCalendarId ?? "primary";

  if (side === "mine") {
    if (!user.googleRefreshToken) return { ok: false, reason: "Google Calendar isn't connected." };
    const window = item.dueDate && item.dueTime ? dueWindowToGcal(item.dueDate, item.dueTime) : null;
    try {
      await updateEvent(
        user.googleRefreshToken,
        calendarId,
        item.googleEventId,
        { title: item.title, ...(window ?? {}) },
        user.timezone
      );
    } catch (error) {
      if (error instanceof CalendarAuthError) throw error;
      console.error("[conflict] push to Google failed:", error instanceof Error ? error.message : error);
      return { ok: false, reason: "I couldn't write that to Google Calendar." };
    }
    // `updatedAt` is stamped explicitly alongside it: left to @updatedAt it lands a few ms
    // later, and `updatedAt > calendarSyncedAt` is the local half of the conflict test — the
    // pair would still read as "changed on both sides" and the next sync would re-raise the
    // conflict this button just settled.
    await prisma.item.updateMany({
      where: { id: item.id, userId: user.id },
      data: { calendarSyncedAt: now, updatedAt: now },
    });
    return { ok: true, text: `📱 Kept your version of ${b(item.title)} — Google updated to match.`, toast: "Kept yours" };
  }

  const mirrored = await prisma.calendarEvent.findFirst({
    where: { userId: user.id, googleEventId: item.googleEventId },
  });
  if (!mirrored) return { ok: false, reason: "I no longer have Google's version of that event." };

  // Through `updateItem` rather than a raw write: taking Google's version moves the deadline,
  // and only `updateItem` resets `notificationStage`. Skipping it would leave an item that had
  // already exhausted its escalation ladder permanently silent on its new due date.
  await updateItem(item.id, user.id, {
    title: mirrored.title,
    dueDate: formatDateInTz(mirrored.startsAt, user.timezone),
    dueTime: mirrored.allDay ? null : formatHHmmInTz(mirrored.startsAt, user.timezone),
  });

  // The agreement is recorded after that write, not inside it: `updateItem` lets Prisma stamp
  // @updatedAt at write time, so a `calendarSyncedAt` set in the same call would already be the
  // older of the two and the next Google-side edit would re-raise this same conflict.
  await prisma.item.updateMany({
    where: { id: item.id, userId: user.id },
    data: { calendarSyncedAt: now, updatedAt: now },
  });

  const when = `${formatDateInTz(mirrored.startsAt, user.timezone)}${mirrored.allDay ? "" : ` ${formatHHmmInTz(mirrored.startsAt, user.timezone)}`}`;
  return {
    ok: true,
    text: `📅 Took Google's version: ${b(mirrored.title)} — ${esc(when)}`,
    toast: "Took Google's",
  };
}
