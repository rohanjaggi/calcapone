export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: string;
  color: string;
};

export type Category = { id: string; name: string; color: string };

export type Item = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  category: Category;
  dueDate: string | null;
  dueTime: string | null;
  remindAt: string | null;
  recurring: "none" | "daily" | "weekly" | "monthly";
  googleEventId: string | null;
  parentId?: string | null;
  subtasks?: Item[];
};

export type TimelineItem = {
  id: string;
  type: "event" | "item";
  title: string;
  time: string;
  endTime?: string;
  subtitle: string;
  color: string;
  isReminder?: boolean;
  /** All-day events have no meaningful time-of-day, so they sort ahead of every timed row. */
  allDay?: boolean;
  status?: string;
};

/**
 * A calendar event as the dashboard consumes it — read from the local `calendar_events`
 * mirror, not the Google API. Declared here rather than in `agenda.ts` because `timeline.ts`
 * needs it and `agenda.ts` imports `buildTimeline`; the other direction would be a cycle.
 */
export type AgendaEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};
