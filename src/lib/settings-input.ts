import { SUPPORTED_PROVIDERS } from "@/lib/models";
import type { AiProvider, Priority } from "@/generated/prisma/enums";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES = ["low", "medium", "high"] as const;

export function isHHmm(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

export function isProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && SUPPORTED_PROVIDERS.includes(value);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}
