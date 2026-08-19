import { describe, it, expect } from "vitest";
import { matchByTitle } from "@/lib/services/match-items";

const items = [
  { id: "1", title: "Call mom" },
  { id: "2", title: "Call dentist" },
  { id: "3", title: "Buy milk" },
];

describe("matchByTitle", () => {
  it("prefers an exact title over a substring hit", () => {
    const result = matchByTitle(items, "call mom");
    expect(result).toEqual({ kind: "one", item: items[0] });
  });

  it("is case- and whitespace-insensitive on exact matches", () => {
    expect(matchByTitle(items, "  CALL MOM ")).toEqual({ kind: "one", item: items[0] });
  });

  it("returns every candidate when a substring is ambiguous", () => {
    const result = matchByTitle(items, "call");
    expect(result.kind).toBe("many");
    expect(result.kind === "many" && result.items).toHaveLength(2);
  });

  it("resolves an unambiguous substring", () => {
    expect(matchByTitle(items, "milk")).toEqual({ kind: "one", item: items[2] });
  });

  it("reports no match", () => {
    expect(matchByTitle(items, "taxes")).toEqual({ kind: "none" });
    expect(matchByTitle([], "anything")).toEqual({ kind: "none" });
  });

  it("treats a blank query as no match rather than matching everything", () => {
    expect(matchByTitle(items, "   ")).toEqual({ kind: "none" });
  });

  it("reports duplicates of the same exact title as ambiguous", () => {
    const dupes = [{ title: "Standup" }, { title: "standup" }];
    expect(matchByTitle(dupes, "standup").kind).toBe("many");
  });
});
