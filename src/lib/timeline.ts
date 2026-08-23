import { formatDateInTz, todayInTz, combineDateTimeInTz } from "@/lib/tz";
import { deadlineUrgency } from "@/lib/services/escalation";
import type { Item, AgendaEvent, TimelineItem } from "@/lib/mock-data";

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

    let time: string | null = null;
    let itemDay: string | null = null;
    // A task due on a date but at no particular hour has no place on the clock. It used to be
    // dropped entirely, so "essay due Friday" appeared on no day at all while still showing in
    // /list and still escalating in Telegram. It now heads that day, like an all-day event.
    let untimed = false;

    if (item.remindAt) {
      const instant = new Date(item.remindAt);
      if (isNaN(instant.getTime())) continue;
      time = item.remindAt;
      itemDay = formatDateInTz(instant, tz);
    } else if (item.dueDate) {
      untimed = !item.dueTime;
      time = `${item.dueDate}T${item.dueTime ?? "00:00"}:00`;
      itemDay = item.dueDate;
    }

    if (!time || itemDay !== day) continue;

    const urgency = item.remindAt ? null : urgencyOf(item.dueDate, item.dueTime);

    timelineItems.push({
      id: item.id,
      type: "item",
      title: item.title,
      time,
      subtitle: `${item.category.name} · ${item.priority}`,
      color: item.category.color,
      isReminder: !!item.remindAt,
      ...(untimed ? { allDay: true } : {}),
      ...(urgency ? { urgency } : {}),
      status: item.status,
    });
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
