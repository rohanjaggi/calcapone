export type Rung = {
  /** Fire once the deadline is this many hours away or nearer. 0 means "at or past due". */
  hoursBefore: number;
  /** Headline for the alert, e.g. "Due soon". */
  label: string;
};

/**
 * One ladder for every item, ordered nearest-deadline-last so a rung's array index doubles
 * as its 1-based stage number.
 */
export const LADDER: Rung[] = [
  { hoursBefore: 24, label: "Due" },
  { hoursBefore: 2, label: "Due soon" },
  { hoursBefore: 0, label: "Overdue" },
];

/** `notificationStage` counts 0..this, so the candidate query bounds on it. */
export const MAX_ESCALATION_STAGE = LADDER.length;

/**
 * The rung this item should be on now, or null if it is already there (or past everything).
 * Stage numbers are 1-based positions in the ladder.
 *
 * Picks the LAST rung whose threshold is still `>= hoursUntilDue` — i.e. the tightest one the
 * deadline currently satisfies — rather than the first. An item the cron only starts watching
 * once it's 30 minutes out must land on "Due soon" immediately; walking the ladder from the
 * top would fire the 24h rung for an item that was never seen 24h out.
 */
export function nextEscalation(
  hoursUntilDue: number,
  currentStage: number
): { stage: number; label: string } | null {
  let matchIndex = -1;
  for (let i = 0; i < LADDER.length; i++) {
    if (LADDER[i].hoursBefore >= hoursUntilDue) matchIndex = i;
  }
  if (matchIndex === -1) return null;

  const stage = matchIndex + 1;
  if (stage <= currentStage) return null;

  return { stage, label: LADDER[matchIndex].label };
}
