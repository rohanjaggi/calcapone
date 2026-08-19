import { describe, it, expect } from "vitest";
import { esc, b, chunkMessage } from "@/lib/services/telegram";

describe("telegram formatting", () => {
  it("escapes HTML special characters", () => {
    expect(esc("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(esc(null)).toBe("");
    expect(esc(42)).toBe("42");
  });

  it("bold wraps escaped content", () => {
    expect(b("read snake_case_guide <now>")).toBe("<b>read snake_case_guide &lt;now&gt;</b>");
  });

  it("chunks long messages on newline boundaries", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `${i + 1}. task number ${i + 1}`);
    const text = lines.join("\n");
    const chunks = chunkMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4096);
    expect(chunks.join("\n")).toBe(text);
    expect(chunkMessage("short")).toEqual(["short"]);
  });

  it("hard-splits a single overlong line", () => {
    const text = "x".repeat(9000);
    const chunks = chunkMessage(text);
    expect(chunks.map((c) => c.length)).toEqual([4096, 4096, 808]);
  });
});
