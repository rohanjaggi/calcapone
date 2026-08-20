import { describe, it, expect } from "vitest";
import { ladderFor, nextEscalation, MAX_ESCALATION_STAGE } from "@/lib/services/escalation";

describe("MAX_ESCALATION_STAGE", () => {
  it("equals the longest ladder", () => {
    const longest = Math.max(
      ladderFor("task").length,
      ladderFor("assignment").length,
      ladderFor("exam").length,
      ladderFor("class").length
    );
    expect(MAX_ESCALATION_STAGE).toBe(longest);
    expect(MAX_ESCALATION_STAGE).toBe(4);
  });
});

describe("nextEscalation: task ladder walk", () => {
  it("walks 24h -> 2h -> overdue as the deadline closes in", () => {
    expect(nextEscalation("task", 24, 0)).toEqual({ stage: 1, label: "Due" });
    expect(nextEscalation("task", 2, 1)).toEqual({ stage: 2, label: "Due soon" });
    expect(nextEscalation("task", 0, 2)).toEqual({ stage: 3, label: "Overdue" });
  });

  it("class shares the task ladder", () => {
    expect(nextEscalation("class", 24, 0)).toEqual({ stage: 1, label: "Due" });
    expect(nextEscalation("class", 2, 1)).toEqual({ stage: 2, label: "Due soon" });
    expect(nextEscalation("class", 0, 2)).toEqual({ stage: 3, label: "Overdue" });
  });
});

describe("nextEscalation: assignment ladder walk", () => {
  it("walks 72h -> 24h -> 2h -> overdue", () => {
    expect(nextEscalation("assignment", 72, 0)).toEqual({ stage: 1, label: "Due in 3 days" });
    expect(nextEscalation("assignment", 24, 1)).toEqual({ stage: 2, label: "Due tomorrow" });
    expect(nextEscalation("assignment", 2, 2)).toEqual({ stage: 3, label: "Due soon" });
    expect(nextEscalation("assignment", 0, 3)).toEqual({ stage: 4, label: "Overdue" });
  });
});

describe("nextEscalation: exam ladder walk", () => {
  it("walks 168h -> 72h -> 24h -> today", () => {
    expect(nextEscalation("exam", 168, 0)).toEqual({ stage: 1, label: "Exam in a week" });
    expect(nextEscalation("exam", 72, 1)).toEqual({ stage: 2, label: "Exam in 3 days" });
    expect(nextEscalation("exam", 24, 2)).toEqual({ stage: 3, label: "Exam tomorrow" });
    expect(nextEscalation("exam", 0, 3)).toEqual({ stage: 4, label: "Exam today" });
  });
});

describe("nextEscalation: skip-ahead on first sight", () => {
  it("jumps a task first seen inside the closest rung straight to the highest applicable stage", () => {
    // 30 minutes out, never having been escalated before — must not land on stage 1 ("Due").
    expect(nextEscalation("task", 0.5, 0)).toEqual({ stage: 2, label: "Due soon" });
  });

  it("jumps an exam first seen the day before straight past the week/3-day rungs", () => {
    expect(nextEscalation("exam", 20, 0)).toEqual({ stage: 3, label: "Exam tomorrow" });
  });

  it("jumps straight to overdue when first seen already past due", () => {
    expect(nextEscalation("assignment", -5, 0)).toEqual({ stage: 4, label: "Overdue" });
  });
});

describe("nextEscalation: currentStage gating", () => {
  it("returns null once the item is already at the computed stage", () => {
    expect(nextEscalation("task", 24, 1)).toBeNull();
  });

  it("returns null when the item is already past the computed stage", () => {
    expect(nextEscalation("task", 24, 2)).toBeNull();
  });
});

describe("nextEscalation: exact deadline", () => {
  it("hoursUntilDue === 0 counts as the overdue rung for every kind", () => {
    expect(nextEscalation("task", 0, 0)).toEqual({ stage: 3, label: "Overdue" });
    expect(nextEscalation("class", 0, 0)).toEqual({ stage: 3, label: "Overdue" });
    expect(nextEscalation("assignment", 0, 0)).toEqual({ stage: 4, label: "Overdue" });
    expect(nextEscalation("exam", 0, 0)).toEqual({ stage: 4, label: "Exam today" });
  });
});

describe("nextEscalation: far future", () => {
  it("returns null when the deadline is further out than the ladder's first rung", () => {
    expect(nextEscalation("task", 48, 0)).toBeNull();
    expect(nextEscalation("assignment", 100, 0)).toBeNull();
    expect(nextEscalation("exam", 200, 0)).toBeNull();
  });
});
