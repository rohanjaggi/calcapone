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
  /** No meaningful time-of-day — an all-day event, or a task due on a date but at no hour. */
  allDay?: boolean;
  /** Countdown badge for a deadline, settled on the server. Absent for events and undated rows. */
  urgency?: { label: string; severity: "overdue" | "urgent" | "soon" | "upcoming" };
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
