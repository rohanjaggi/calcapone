import { SUPPORTED_PROVIDERS } from "@/lib/models";
import { isSelectableTz } from "@/lib/tz";
import type { AiProvider, Priority } from "@/generated/prisma/enums";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES = ["low", "medium", "high"] as const;

export type SettingsPatch = {
  timezone?: string;
  briefingEnabled?: boolean;
  briefingTime?: string | null;
  aiProvider?: AiProvider | null;
  aiApiKey?: string | null;
  aiModel?: string | null;
};

export type Ok<T> = { data: T };
export type Err = { error: string };

export function isHHmm(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

export function isProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && SUPPORTED_PROVIDERS.includes(value);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * Validate the *values* of a settings patch, not just the field names. Without this an
 * unknown `aiProvider` or a malformed `briefingTime` reaches Prisma and surfaces as a 500,
 * and a bad provider then breaks every later AI call.
 */
export function parseSettingsPatch(body: unknown): Ok<SettingsPatch> | Err {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "body must be an object" };
  }
  const raw = body as Record<string, unknown>;
  const data: SettingsPatch = {};

  if ("timezone" in raw) {
    if (typeof raw.timezone !== "string" || !isSelectableTz(raw.timezone)) {
      return { error: "timezone must be a valid IANA time zone" };
    }
    data.timezone = raw.timezone;
  }

  if ("briefingEnabled" in raw) {
    if (typeof raw.briefingEnabled !== "boolean") return { error: "briefingEnabled must be a boolean" };
    data.briefingEnabled = raw.briefingEnabled;
  }

  if ("briefingTime" in raw) {
    if (raw.briefingTime === null) data.briefingTime = null;
    else if (isHHmm(raw.briefingTime)) data.briefingTime = raw.briefingTime;
    else return { error: "briefingTime must be HH:mm or null" };
  }

  if ("aiProvider" in raw) {
    if (raw.aiProvider === null) data.aiProvider = null;
    else if (isProvider(raw.aiProvider)) data.aiProvider = raw.aiProvider;
    else return { error: `aiProvider must be one of: ${SUPPORTED_PROVIDERS.join(", ")}` };
  }

  if ("aiApiKey" in raw) {
    if (raw.aiApiKey === null || raw.aiApiKey === "") data.aiApiKey = null;
    else if (typeof raw.aiApiKey === "string") data.aiApiKey = raw.aiApiKey;
    else return { error: "aiApiKey must be a string or null" };
  }

  if ("aiModel" in raw) {
    if (raw.aiModel === null || raw.aiModel === "") data.aiModel = null;
    else if (typeof raw.aiModel === "string") data.aiModel = raw.aiModel;
    else return { error: "aiModel must be a string or null" };
  }

  return { data };
}
