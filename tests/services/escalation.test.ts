import { describe, it, expect } from "vitest";
import { nextEscalation, LADDER, MAX_ESCALATION_STAGE, deadlineUrgency } from "@/lib/services/escalation";
import { combineDateTimeInTz } from "@/lib/tz";

describe("LADDER", () => {
  it("is a single ladder: 24h, 2h, overdue", () => {
    expect(LADDER.map((r) => r.hoursBefore)).toEqual([24, 2, 0]);
    expect(LADDER.map((r) => r.label)).toEqual(["Due", "Due soon", "Overdue"]);
  });

  it("bounds the candidate query on its own length", () => {
    expect(MAX_ESCALATION_STAGE).toBe(LADDER.length);
  });
});

describe("nextEscalation", () => {
  it("fires the 24h rung for an item a day out", () => {
    expect(nextEscalation(20, 0)).toEqual({ stage: 1, label: "Due" });
  });

  it("picks the tightest rung the deadline satisfies, not the first", () => {
    // An item the cron only starts watching 30 minutes out must land on "Due soon"
    // immediately. Walking the ladder from the top would fire the 24h rung for an item
    // that was never seen 24h out.
    expect(nextEscalation(0.5, 0)).toEqual({ stage: 2, label: "Due soon" });
  });

  it("fires the overdue rung once the deadline has passed", () => {
    expect(nextEscalation(-1, 2)).toEqual({ stage: 3, label: "Overdue" });
  });

  it("does not re-fire a stage already reached", () => {
    expect(nextEscalation(0.5, 2)).toBeNull();
  });

  it("returns null past the end of the ladder", () => {
    expect(nextEscalation(-5, 3)).toBeNull();
  });

  it("returns null for an item further out than the widest rung", () => {
    expect(nextEscalation(100, 0)).toBeNull();
  });
});

describe("deadlineUrgency", () => {
  const SG = "Asia/Singapore";
  const combine = (d: string, t: string) => combineDateTimeInTz(d, t, SG);
  // 2026-08-20 10:00 in Singapore.
  const NOW = combineDateTimeInTz("2026-08-20", "10:00", SG);
  const TODAY = "2026-08-20";

  /** Non-null asserted: every call here passes a real date, so a null would be the bug. */
  const at = (date: string, time: string | null) =>
    deadlineUrgency(date, time, TODAY, NOW, combine)!;

  it("returns null when there is no deadline", () => {
    expect(deadlineUrgency(null, null, TODAY, NOW, combine)).toBeNull();
  });

  it("reads a passed deadline as overdue", () => {
    expect(at("2026-08-19", "09:00")).toEqual({ label: "overdue", severity: "overdue" });
  });

  it("counts down in minutes inside the hour", () => {
    expect(at(TODAY, "10:30")).toEqual({ label: "in 30m", severity: "urgent" });
  });

  it("counts down in hours later the same day", () => {
    expect(at(TODAY, "16:00")).toEqual({ label: "in 6h", severity: "soon" });
  });

  it("says tomorrow rather than 'in 1 day'", () => {
    // 09:00 tomorrow is 23 hours out, but it is still tomorrow.
    expect(at("2026-08-21", "09:00").label).toBe("tomorrow");
  });

  it("counts days out to a fortnight", () => {
    expect(at("2026-08-27", "12:00")).toEqual({ label: "in 7 days", severity: "upcoming" });
  });

  it("switches to weeks past a fortnight", () => {
    expect(at("2026-09-17", "12:00").label).toBe("in 4 weeks");
  });

  it("treats a dateless-time deadline as end of day", () => {
    // No due time -> 23:59, which is 13h59 away, so "soon" rather than "urgent".
    expect(at(TODAY, null)).toEqual({ label: "in 14h", severity: "soon" });
  });

  it("turns amber exactly when the 'Due soon' push would fire", () => {
    // LADDER[1].hoursBefore is 2, so 2h out is urgent and 3h out is not.
    expect(at(TODAY, "12:00").severity).toBe("urgent");
    expect(at(TODAY, "13:00").severity).toBe("soon");
  });
});
