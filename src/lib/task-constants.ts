import { Circle, Loader2, CheckCircle2 } from "lucide-react";

export const priorityColors: Record<string, string> = {
  high: "#B85C5C",
  medium: "#92785C",
  low: "#A8A29E",
};

export const priorityLabels: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const statusIcon = {
  pending: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
};

export function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Render a `YYYY-MM-DD` due date for display.
 *
 * `new Date("2026-06-15")` is parsed as UTC midnight, which in any negative-offset zone is
 * still the 14th locally — so a task due the 15th showed as "Jun 14" for every user in the
 * Americas. Splitting the parts builds the date in the local calendar instead.
 */
export function formatDueDate(dateStr: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", options);
}
