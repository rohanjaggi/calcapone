import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/** How long a disambiguation prompt stays answerable. Past this the world may have moved on. */
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

export async function createPendingAction(input: {
  userId: string;
  chatId: number | bigint;
  tool: string;
  args: Record<string, unknown>;
  candidates: string[];
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const row = await prisma.pendingAction.create({
    data: {
      userId: input.userId,
      chatId: BigInt(input.chatId),
      tool: input.tool,
      args: input.args as unknown as Prisma.InputJsonValue,
      candidates: input.candidates,
      expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS),
    },
    select: { id: true },
  });
  return row.id;
}

/** A Json column can hold anything a caller ever wrote; only a plain object is usable as args. */
function asArgsRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Take the parked call, if it is still valid, and delete it in the same breath so a second
 * tap of the same button cannot run the action twice.
 */
export async function consumePendingAction(
  id: string,
  userId: string,
  now: Date = new Date()
): Promise<{ tool: string; args: Record<string, unknown>; candidates: string[] } | null> {
  const row = await prisma.pendingAction.findUnique({ where: { id } });
  if (!row) return null;

  // Re-check ownership and expiry at delete time, not read time, so a row another request
  // already claimed (or that expired between the two) loses the race and reports 0 here.
  const { count } = await prisma.pendingAction.deleteMany({
    where: { id, userId, expiresAt: { gt: now } },
  });
  if (count !== 1) return null;

  return { tool: row.tool, args: asArgsRecord(row.args), candidates: row.candidates };
}

export async function prunePendingActions(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.pendingAction.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
