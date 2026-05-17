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
  status?: string;
};
