import { prisma } from "@/lib/prisma";

/**
 * Clear a dead Google Calendar link. Called after a CalendarAuthError so the UI stops
 * claiming "Connected" and the user is prompted to reconnect, instead of every calendar
 * write silently doing nothing.
 */
export async function markCalendarDisconnected(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId },
    data: { googleRefreshToken: null },
  });
}

export const CALENDAR_RECONNECT_MESSAGE =
  "Your Google Calendar link expired — Google no longer accepts it. Reconnect it in Settings and try again.";
