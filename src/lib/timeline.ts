import { formatDateInTz } from "@/lib/tz";
import type { Item, TimelineItem } from "@/lib/mock-data";

/**
 * The rows under the dashboard's "Today" heading.
 *
 * `today` is passed in rather than read from the clock so this stays pure: the dashboard is a
 * client component that also renders on the server, and a `new Date()` here would be read
 * twice — once per environment — which mismatches on a midnight boundary. The server settles
 * the calendar day once, in the user's zone, and both renders agree.
 *
 * The two time sources are not the same kind of value, and bucketing them into a day differs:
 *  - `remindAt` is an absolute instant (UTC ISO), so its calendar day depends on `tz`
 *  - `dueDate`/`dueTime` is already wall-clock in the user's zone, so `dueDate` *is* the day
 */
export function buildTimeline(items: Item[], tz: string, today: string): TimelineItem[] {
  const timelineItems: TimelineItem[] = [];

  for (const item of items) {
    if (item.status === "done") continue;

    let time: string | null = null;
    let day: string | null = null;

    if (item.remindAt) {
      const instant = new Date(item.remindAt);
      if (isNaN(instant.getTime())) continue;
      time = item.remindAt;
      day = formatDateInTz(instant, tz);
    } else if (item.dueDate && item.dueTime) {
      time = `${item.dueDate}T${item.dueTime}:00`;
      day = item.dueDate;
    }

    if (!time || day !== today) continue;

    timelineItems.push({
      id: item.id,
      type: "item",
      title: item.title,
      time,
      subtitle: `${item.category.name} · ${item.priority}`,
      color: item.category.color,
      isReminder: !!item.remindAt,
      status: item.status,
    });
  }

  timelineItems.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return timelineItems;
}
