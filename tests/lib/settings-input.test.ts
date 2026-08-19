import { describe, it, expect } from "vitest";
import { parseSettingsPatch, isHHmm, isProvider, isPriority } from "@/lib/settings-input";

describe("parseSettingsPatch", () => {
  it("accepts a valid patch and drops unknown fields", () => {
    const result = parseSettingsPatch({
      timezone: "Asia/Singapore",
      briefingEnabled: true,
      briefingTime: "07:30",
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-5",
      userId: "someone-else",
      notificationStage: 3,
    });
    expect(result).toEqual({
      data: {
        timezone: "Asia/Singapore",
        briefingEnabled: true,
        briefingTime: "07:30",
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-5",
      },
    });
  });

  it("rejects an unknown AI provider", () => {
    expect(parseSettingsPatch({ aiProvider: "skynet" })).toHaveProperty("error");
  });

  it("rejects an invalid timezone", () => {
    expect(parseSettingsPatch({ timezone: "Mars/Olympus" })).toHaveProperty("error");
  });

  it("rejects a malformed briefing time", () => {
    expect(parseSettingsPatch({ briefingTime: "7am" })).toHaveProperty("error");
    expect(parseSettingsPatch({ briefingTime: "25:00" })).toHaveProperty("error");
  });

  it("rejects a non-boolean briefingEnabled", () => {
    expect(parseSettingsPatch({ briefingEnabled: "yes" })).toHaveProperty("error");
  });

  it("normalises empty strings to null so a blank field clears the value", () => {
    expect(parseSettingsPatch({ aiApiKey: "", aiModel: "" })).toEqual({
      data: { aiApiKey: null, aiModel: null },
    });
  });

  it("allows explicit nulls", () => {
    expect(parseSettingsPatch({ briefingTime: null, aiProvider: null })).toEqual({
      data: { briefingTime: null, aiProvider: null },
    });
  });

  it("rejects non-object bodies", () => {
    expect(parseSettingsPatch(null)).toHaveProperty("error");
    expect(parseSettingsPatch([])).toHaveProperty("error");
    expect(parseSettingsPatch("timezone=UTC")).toHaveProperty("error");
  });

  it("returns an empty patch when nothing is supplied", () => {
    expect(parseSettingsPatch({})).toEqual({ data: {} });
  });
});

describe("value guards", () => {
  it("isHHmm", () => {
    expect(isHHmm("00:00")).toBe(true);
    expect(isHHmm("23:59")).toBe(true);
    expect(isHHmm("24:00")).toBe(false);
    expect(isHHmm("9:00")).toBe(false);
    expect(isHHmm(null)).toBe(false);
  });

  it("isProvider", () => {
    expect(isProvider("openai")).toBe(true);
    expect(isProvider("openrouter")).toBe(true);
    expect(isProvider("nope")).toBe(false);
  });

  it("isPriority", () => {
    expect(isPriority("high")).toBe(true);
    expect(isPriority("urgent")).toBe(false);
  });
});
