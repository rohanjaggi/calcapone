import { prisma } from "@/lib/prisma";

/**
 * Clear a dead Google Calendar link. Called after a CalendarAuthError so the UI stops
 * claiming "Connected" and the user is prompted to reconnect, instead of every calendar
 * write silently doing nothing.
 */
export async function markCalendarDisconnected(userId: string): Promise<void> {
  // The local copy goes too: left behind, Home kept showing 90 days of events and the sync
  // cron kept sending "starts in 15 min" pings for a calendar that was no longer connected.
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: userId },
      data: { googleRefreshToken: null, googleSyncToken: null, lastCalendarSyncAt: null },
    }),
    prisma.calendarEvent.deleteMany({ where: { userId } }),
  ]);
}

export const CALENDAR_RECONNECT_MESSAGE =
  "Your Google Calendar link expired — Google no longer accepts it. Reconnect it in Open Calcapone → Settings and try again.";
