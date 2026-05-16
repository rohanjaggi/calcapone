export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: string;
  color: string;
};

export type Todo = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  category: { name: string; color: string } | null;
  dueDate: string | null;
};

export type Reminder = {
  id: string;
  message: string;
  remindAt: string;
  recurring: "none" | "daily" | "weekly" | "monthly";
  status: "pending" | "sent" | "cancelled";
  category: { name: string; color: string } | null;
};

export type TimelineItem = {
  id: string;
  type: "event" | "todo" | "reminder";
  title: string;
  time: string;
  endTime?: string;
  subtitle: string;
  color: string;
  status?: string;
};

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const base = `${yyyy}-${mm}-${dd}`;

export const mockUser = {
  name: "Rohan",
  timezone: "America/New_York",
};

export const mockCategories = [
  { id: "1", name: "Work", color: "#4A6FA5" },
  { id: "2", name: "Personal", color: "#92785C" },
  { id: "3", name: "Health", color: "#6B8F71" },
];

export const mockEvents: CalendarEvent[] = [
  {
    id: "e1",
    title: "Team standup",
    startTime: `${base}T09:00:00`,
    endTime: `${base}T09:30:00`,
    category: "Work",
    color: "#4A6FA5",
  },
  {
    id: "e2",
    title: "Design review",
    startTime: `${base}T11:30:00`,
    endTime: `${base}T12:30:00`,
    category: "Work",
    color: "#4A6FA5",
  },
  {
    id: "e3",
    title: "Client call",
    startTime: `${base}T15:00:00`,
    endTime: `${base}T15:45:00`,
    category: "Work",
    color: "#4A6FA5",
  },
];

export const mockTodos: Todo[] = [
  {
    id: "t1",
    title: "Review Q2 report",
    status: "in_progress",
    priority: "high",
    category: { name: "Work", color: "#4A6FA5" },
    dueDate: `${base}T17:00:00`,
  },
  {
    id: "t2",
    title: "Send invoice to client",
    status: "pending",
    priority: "high",
    category: { name: "Work", color: "#4A6FA5" },
    dueDate: `${base}T18:00:00`,
  },
  {
    id: "t3",
    title: "Buy groceries",
    status: "pending",
    priority: "low",
    category: { name: "Personal", color: "#92785C" },
    dueDate: null,
  },
  {
    id: "t4",
    title: "Update portfolio site",
    status: "pending",
    priority: "medium",
    category: { name: "Personal", color: "#92785C" },
    dueDate: null,
  },
  {
    id: "t5",
    title: "Book dentist appointment",
    status: "pending",
    priority: "low",
    category: { name: "Health", color: "#6B8F71" },
    dueDate: null,
  },
];

export const mockReminders: Reminder[] = [
  {
    id: "r1",
    message: "Call mom",
    remindAt: `${base}T17:00:00`,
    recurring: "none",
    status: "pending",
    category: { name: "Personal", color: "#92785C" },
  },
  {
    id: "r2",
    message: "Take medication",
    remindAt: `${base}T20:00:00`,
    recurring: "daily",
    status: "pending",
    category: { name: "Health", color: "#6B8F71" },
  },
];

export function buildTimeline(
  events: CalendarEvent[],
  todos: Todo[],
  reminders: Reminder[]
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const e of events) {
    const start = new Date(e.startTime);
    const end = new Date(e.endTime);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    items.push({
      id: e.id,
      type: "event",
      title: e.title,
      time: e.startTime,
      endTime: e.endTime,
      subtitle: `${duration} min · ${e.category}`,
      color: e.color,
    });
  }

  for (const t of todos) {
    if (t.dueDate) {
      items.push({
        id: t.id,
        type: "todo",
        title: t.title,
        time: t.dueDate,
        subtitle: `${t.category?.name ?? "Uncategorized"} · ${t.priority}`,
        color: t.category?.color ?? "#92785C",
        status: t.status,
      });
    }
  }

  for (const r of reminders) {
    items.push({
      id: r.id,
      type: "reminder",
      title: r.message,
      time: r.remindAt,
      subtitle:
        r.recurring !== "none"
          ? `${r.recurring} · ${r.category?.name ?? ""}`
          : r.category?.name ?? "",
      color: r.category?.color ?? "#B87D6B",
    });
  }

  items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return items;
}
