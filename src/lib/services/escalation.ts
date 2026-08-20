import type { ItemKind } from "@/generated/prisma/enums";

export type Rung = {
  /** Fire once the deadline is this many hours away or nearer. 0 means "at or past due". */
  hoursBefore: number;
  /** Headline for the alert, e.g. "Exam in 3 days". */
  label: string;
};

/**
 * One ladder per kind, ordered nearest-deadline-last so a rung's array index doubles as its
 * 1-based stage number. An exam gives itself a week's notice because a 24h warning is too
 * late to be useful for something that takes days to prepare for; a task or class only cares
 * once the day is actually here.
 */
const LADDERS: Record<ItemKind, Rung[]> = {
  task: [
    { hoursBefore: 24, label: "Due" },
    { hoursBefore: 2, label: "Due soon" },
    { hoursBefore: 0, label: "Overdue" },
  ],
  class: [
    { hoursBefore: 24, label: "Due" },
    { hoursBefore: 2, label: "Due soon" },
    { hoursBefore: 0, label: "Overdue" },
  ],
  assignment: [
    { hoursBefore: 72, label: "Due in 3 days" },
    { hoursBefore: 24, label: "Due tomorrow" },
    { hoursBefore: 2, label: "Due soon" },
    { hoursBefore: 0, label: "Overdue" },
  ],
  exam: [
    { hoursBefore: 168, label: "Exam in a week" },
    { hoursBefore: 72, label: "Exam in 3 days" },
    { hoursBefore: 24, label: "Exam tomorrow" },
    { hoursBefore: 0, label: "Exam today" },
  ],
};

/** The longest ladder. `notificationStage` counts 0..this, so the candidate query bounds on it. */
export const MAX_ESCALATION_STAGE = Math.max(...Object.values(LADDERS).map((ladder) => ladder.length));

/** Every kind with a ladder — lets the candidate query bound each kind on its own length. */
export const ESCALATION_KINDS = Object.keys(LADDERS) as ItemKind[];

export function ladderFor(kind: ItemKind): Rung[] {
  return LADDERS[kind];
}

/**
 * The rung this item should be on now, or null if it is already there (or past everything).
 * Stage numbers are 1-based positions in the kind's ladder.
 *
 * Picks the LAST rung whose threshold is still `>= hoursUntilDue` — i.e. the tightest one the
 * deadline currently satisfies — rather than the first. An item the cron only starts watching
 * once it's 30 minutes out must land on "Due soon" immediately; walking the ladder from the
 * top would fire the 24h rung for an item that was never seen 24h out.
 */
export function nextEscalation(
  kind: ItemKind,
  hoursUntilDue: number,
  currentStage: number
): { stage: number; label: string } | null {
  const ladder = ladderFor(kind);

  let matchIndex = -1;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i].hoursBefore >= hoursUntilDue) matchIndex = i;
  }
  if (matchIndex === -1) return null;

  const stage = matchIndex + 1;
  if (stage <= currentStage) return null;

  return { stage, label: ladder[matchIndex].label };
}
