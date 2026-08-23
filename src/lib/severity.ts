import type { Severity } from "@/lib/services/escalation";

/**
 * How each deadline severity is painted. Shared by the timeline badge, the week strip's dot
 * and the "Coming up" list so one deadline reads the same wherever it appears.
 *
 * Only overdue and urgent get a colour. If "due in three days" were also tinted, the whole
 * dashboard would be amber most of the time and the colour would stop meaning anything.
 */
export const SEVERITY_STYLES: Record<Severity, { text: string; bg: string; dot: string }> = {
  overdue: { text: "text-destructive", bg: "bg-destructive/10", dot: "bg-destructive" },
  urgent: { text: "text-amber-600", bg: "bg-amber-500/10", dot: "bg-amber-500" },
  soon: { text: "text-muted-foreground", bg: "bg-secondary", dot: "bg-muted-foreground/60" },
  upcoming: { text: "text-muted-foreground", bg: "bg-secondary", dot: "bg-muted-foreground/40" },
};
