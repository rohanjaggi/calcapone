import { formatDateInTz, todayInTz, combineDateTimeInTz } from "@/lib/tz";
import { deadlineUrgency } from "@/lib/services/escalation";
import type { Item, AgendaEvent, TimelineItem } from "@/lib/types";

/** Calendar events all share one colour — they aren't categorised the way items are. */
const EVENT_COLOR = "#4A6FA5";

/**
 * The rows under the dashboard's day heading.
 *
 * `day` is passed in rather than read from the clock so this stays pure: the dashboard is a
 * client component that also renders on the server, and a `new Date()` here would be read
 * twice — once per environment — which mismatches on a midnight boundary. The server settles
 * the calendar day once, in the user's zone, and both renders agree.
 *
 * The time sources are not the same kind of value, and bucketing them into a day differs:
 *  - `remindAt` and an event's `startsAt` are absolute instants (UTC ISO), so their calendar
 *    day depends on `tz`
 *  - `dueDate`/`dueTime` is already wall-clock in the user's zone, so `dueDate` *is* the day
 */
export function buildTimeline(
  items: Item[],
  events: AgendaEvent[],
  tz: string,
  day: string,
  now: Date = new Date()
): TimelineItem[] {
  const timelineItems: TimelineItem[] = [];
  const todayStr = todayInTz(tz, now);
  const urgencyOf = (dueDate: string | null, dueTime: string | null) =>
    deadlineUrgency(dueDate, dueTime, todayStr, now, (d, t) => combineDateTimeInTz(d, t, tz));

  for (const item of items) {
    if (item.status === "done") continue;
    const base = {
      id: item.id,
      type: "item" as const,
      title: item.title,
      subtitle: `${item.category.name} · ${item.priority}`,
      color: item.category.color,
      status: item.status,
    };

    // A reminder belongs to the day it rings and a deadline to its due day, so "essay due Fri,
    // remind Thu 20:00" shows on both — it used to vanish from Friday.
    const ringsAt = item.remindAt ? new Date(item.remindAt) : null;
    const reminderDay = ringsAt && !isNaN(ringsAt.getTime()) ? formatDateInTz(ringsAt, tz) : null;
    if (item.remindAt && reminderDay === day) {
      timelineItems.push({ ...base, time: item.remindAt, isReminder: true });
    } else if (item.dueDate === day) {
      // A task due on a date at no hour heads the day, like an all-day event.
      const urgency = urgencyOf(item.dueDate, item.dueTime);
      timelineItems.push({
        ...base,
        // An instant, not a bare "2026-11-19T09:00:00": the server reads that as UTC, so a 9am
        // Singapore task rendered as 5pm and sorted after the afternoon.
        time: combineDateTimeInTz(item.dueDate, item.dueTime ?? "00:00", tz).toISOString(),
        isReminder: false,
        ...(item.dueTime ? {} : { allDay: true }),
        ...(urgency ? { urgency } : {}),
      });
    }
  }

  for (const ev of events) {
    const instant = new Date(ev.startsAt);
    if (isNaN(instant.getTime())) continue;
    if (formatDateInTz(instant, tz) !== day) continue;

    timelineItems.push({
      id: ev.id,
      type: "event",
      title: ev.title,
      time: ev.startsAt,
      endTime: ev.endsAt,
      subtitle: ev.allDay ? "All day" : "Calendar",
      color: EVENT_COLOR,
      allDay: ev.allDay,
    });
  }

  // An all-day event has no time-of-day to sort by, and midnight in the user's zone would
  // place it arbitrarily among the early rows — so it heads the list instead.
  timelineItems.sort((a, b) => {
    if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
    return new Date(a.time).getTime() - new Date(b.time).getTime();
  });

  return timelineItems;
}
