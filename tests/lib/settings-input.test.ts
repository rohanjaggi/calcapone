import { describe, it, expect } from "vitest";
import { isHHmm, isProvider, isPriority } from "@/lib/settings-input";

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
