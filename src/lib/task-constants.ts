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
