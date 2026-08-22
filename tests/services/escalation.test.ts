import { describe, it, expect } from "vitest";
import { nextEscalation, LADDER, MAX_ESCALATION_STAGE } from "@/lib/services/escalation";

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
