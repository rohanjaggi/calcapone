import { describe, expect, it } from "vitest";
import { minuteInTz, mixOklab, skyAt } from "@/lib/sky";

const IVORY = "#F3EEE6";
const HEX = /^#[0-9A-F]{6}$/;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("mixOklab", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(mixOklab("#123456", "#ABCDEF", 0)).toBe("#123456");
    expect(mixOklab("#123456", "#ABCDEF", 1)).toBe("#ABCDEF");
  });

  it("round-trips a colour blended with itself", () => {
    expect(mixOklab("#E08757", "#E08757", 0.5)).toBe("#E08757");
  });
});

describe("skyAt", () => {
  it("produces valid colours for every minute of the day", () => {
    for (let m = 0; m < 1440; m++) {
      const sky = skyAt(m);
      for (const c of [sky.zenith, sky.mid, sky.low, sky.horizon, sky.accent, ...sky.foil]) expect(c).toMatch(HEX);
    }
  });

  it("keeps the greeting band dark enough for body text all day", () => {
    for (let m = 0; m < 1440; m += 5) expect(contrast(IVORY, skyAt(m).low)).toBeGreaterThanOrEqual(4.5);
  });

  it("changes gently: no visible jump between neighbouring minutes", () => {
    for (let m = 0; m < 1440; m++) {
      const a = skyAt(m).mid;
      const b = skyAt(m + 1).mid;
      expect(Math.abs(luminance(a) - luminance(b))).toBeLessThan(0.01);
    }
  });

  it("names the phase of the day", () => {
    expect(skyAt(1 * 60).phase).toBe("Night");
    expect(skyAt(7 * 60).phase).toBe("Dawn");
    expect(skyAt(12 * 60 + 30).phase).toBe("Midday");
    expect(skyAt(18 * 60 + 45).phase).toBe("Dusk");
  });

  it("wraps around midnight", () => {
    expect(skyAt(1440)).toEqual(skyAt(0));
    expect(skyAt(-60)).toEqual(skyAt(1380));
  });
});

describe("minuteInTz", () => {
  it("reads the minute of the day in the given zone, not the machine's", () => {
    const instant = new Date("2026-11-18T17:04:00Z");
    expect(minuteInTz("Asia/Singapore", instant)).toBe(1 * 60 + 4);
    expect(minuteInTz("Europe/London", instant)).toBe(17 * 60 + 4);
  });
});
