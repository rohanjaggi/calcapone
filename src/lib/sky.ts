/**
 * The living sky: what the top of the app looks like at a given minute of the user's day.
 *
 * Keyframes are hand-tuned skies; between two of them the colours are blended in OKLab, so
 * dusk fades into night through violet rather than through mud. Every `low` colour (the band
 * the greeting sits on) is dark enough for the ivory text to keep 4.5:1.
 */

export type Sky = {
  /** Top of the band. */
  zenith: string;
  /** Behind the date. */
  mid: string;
  /** Behind the greeting; kept dark enough for body text. */
  low: string;
  /** The thin glow where the sky meets the page. */
  horizon: string;
  /** Four stops of the date's foil, base to highlight. */
  foil: [string, string, string, string];
  /** The hour's colour, lent to today's ribbon, the Now line and the active tab. */
  accent: string;
  phase: SkyPhase;
};

export type SkyPhase = "Night" | "Dawn" | "Morning" | "Midday" | "Afternoon" | "Dusk";

type Key = Omit<Sky, "phase"> & { at: number; phase: SkyPhase };

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const NIGHT: Omit<Key, "at"> = {
  phase: "Night",
  zenith: "#0B1028",
  mid: "#141B3D",
  low: "#1C2350",
  horizon: "#36437E",
  foil: ["#8E9CD0", "#C8D2F4", "#A9B6E6", "#F2F5FF"],
  accent: "#A9B8F0",
};

const KEYS: Key[] = [
  { at: h(0), ...NIGHT },
  { at: h(4, 45), ...NIGHT },
  {
    at: h(5, 45), phase: "Dawn",
    zenith: "#151A40", mid: "#2A2C5E", low: "#3A3769", horizon: "#8A6E9E",
    foil: ["#B9A3D8", "#E3D2F2", "#CDB8E6", "#F7F0FF"], accent: "#C9B6F0",
  },
  {
    at: h(6, 45), phase: "Dawn",
    zenith: "#2B2F5E", mid: "#433F7A", low: "#56487F", horizon: "#E3A693",
    foil: ["#EDA58C", "#F7CDBB", "#FFE3D6", "#FFF3EA"], accent: "#F2B49A",
  },
  {
    at: h(8, 30), phase: "Morning",
    zenith: "#1F3F72", mid: "#2B5690", low: "#2F5B93", horizon: "#E9C9A0",
    foil: ["#E8C27F", "#F6DFAE", "#FBEBC8", "#FFF8EA"], accent: "#F1D08E",
  },
  {
    at: h(12, 30), phase: "Midday",
    zenith: "#17406F", mid: "#22548C", low: "#285D97", horizon: "#9FC0DA",
    foil: ["#EBC46A", "#FBE7B4", "#FFF1C9", "#FFFDF4"], accent: "#F1CF82",
  },
  {
    at: h(16, 30), phase: "Afternoon",
    zenith: "#1E3866", mid: "#36477A", low: "#4A4877", horizon: "#EDB46E",
    foil: ["#E9A85A", "#F7CF94", "#FCE2BC", "#FFF4E2"], accent: "#F2BE72",
  },
  {
    at: h(18, 45), phase: "Dusk",
    zenith: "#231E4E", mid: "#3A2C68", low: "#4F3569", horizon: "#E08757",
    foil: ["#EE915E", "#FFC9A3", "#FFDCC2", "#FFF0E2"], accent: "#F0A06E",
  },
  {
    at: h(19, 50), phase: "Dusk",
    zenith: "#151634", mid: "#262250", low: "#33295B", horizon: "#8C4E6E",
    foil: ["#D58FB0", "#EDBCD3", "#F6D6E4", "#FFF0F6"], accent: "#E0A6C6",
  },
  { at: h(21), ...NIGHT },
  { at: h(24), ...NIGHT },
];

/** The sky at `minute` (0–1439) of the user's local day. */
export function skyAt(minute: number): Sky {
  const m = ((minute % 1440) + 1440) % 1440;
  const i = KEYS.findIndex((k, idx) => idx < KEYS.length - 1 && m >= k.at && m < KEYS[idx + 1].at);
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (m - a.at) / (b.at - a.at);
  const mix = (x: string, y: string) => mixOklab(x, y, t);
  return {
    phase: t < 0.5 ? a.phase : b.phase,
    zenith: mix(a.zenith, b.zenith),
    mid: mix(a.mid, b.mid),
    low: mix(a.low, b.low),
    horizon: mix(a.horizon, b.horizon),
    foil: a.foil.map((c, j) => mix(c, b.foil[j])) as Sky["foil"],
    accent: mix(a.accent, b.accent),
  };
}

/** Minutes since midnight in `timeZone`. */
export function minuteInTz(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** The sky as CSS custom properties, for a style tag or `element.style`. */
export function skyVars(sky: Sky): Record<string, string> {
  return {
    "--sky-zenith": sky.zenith,
    "--sky-mid": sky.mid,
    "--sky-low": sky.low,
    "--sky-horizon": sky.horizon,
    "--foil-1": sky.foil[0],
    "--foil-2": sky.foil[1],
    "--foil-3": sky.foil[2],
    "--foil-4": sky.foil[3],
    "--hour": sky.accent,
  };
}

// --- OKLab blending -------------------------------------------------------------------------

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

function linearToHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((linear) => {
        const c = Math.min(1, Math.max(0, linear)); // blends can land a hair outside sRGB
        const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(s * 255).toString(16).padStart(2, "0");
      })
      .join("")
      .toUpperCase()
  );
}

function toOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function mixOklab(a: string, b: string, t: number): string {
  if (t <= 0) return a.toUpperCase();
  if (t >= 1) return b.toUpperCase();
  const x = toOklab(hexToLinear(a));
  const y = toOklab(hexToLinear(b));
  return linearToHex(fromOklab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]));
}
