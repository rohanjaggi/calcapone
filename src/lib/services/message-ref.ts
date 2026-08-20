import { prisma } from "@/lib/prisma";

export type MessageRefKind = "list" | "item";

/** Retention: a reply to something older than this is almost certainly not a targeting attempt. */
export const MESSAGE_REF_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Record what a message the bot just sent was about. Never throws — losing this only costs a
 * convenience (a reply or `/done 3` falls back to asking the user to be explicit). Upserts on
 * [chatId, messageId] since a retried send can target the same outgoing message twice.
 */
export async function rememberMessageRef(input: {
  userId: string;
  chatId: number | bigint;
  messageId: number;
  kind: MessageRefKind;
  itemIds: string[];
}): Promise<void> {
  try {
    await prisma.messageRef.upsert({
      where: {
        chatId_messageId: {
          chatId: BigInt(input.chatId),
          messageId: BigInt(input.messageId),
        },
      },
      create: {
        userId: input.userId,
        chatId: BigInt(input.chatId),
        messageId: BigInt(input.messageId),
        kind: input.kind,
        itemIds: input.itemIds,
      },
      update: {
        kind: input.kind,
        itemIds: input.itemIds,
      },
    });
  } catch (error) {
    console.error(
      "[message-ref] failed to remember message ref:",
      error instanceof Error ? error.message : error
    );
  }
}

/** What was this specific bot message about? Used when the user replies to it. */
export async function getMessageRef(
  chatId: number | bigint,
  messageId: number
): Promise<{ kind: MessageRefKind; itemIds: string[] } | null> {
  const ref = await prisma.messageRef.findUnique({
    where: {
      chatId_messageId: {
        chatId: BigInt(chatId),
        messageId: BigInt(messageId),
      },
    },
    select: { kind: true, itemIds: true },
  });
  return ref ? { kind: ref.kind as MessageRefKind, itemIds: ref.itemIds } : null;
}

/** The most recent numbered list the bot printed in this chat, for bare positional commands like `/done 3`. */
export async function latestListRef(
  userId: string,
  chatId: number | bigint,
  now: Date = new Date()
): Promise<{ itemIds: string[] } | null> {
  const cutoff = new Date(now.getTime() - MESSAGE_REF_TTL_MS);
  const ref = await prisma.messageRef.findFirst({
    where: {
      userId,
      chatId: BigInt(chatId),
      kind: "list",
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    select: { itemIds: true },
  });
  return ref ? { itemIds: ref.itemIds } : null;
}

const POSITION_RE = /^[1-9][0-9]*$/;

/**
 * Resolve a positional token against a remembered ordering. "3" -> itemIds[2].
 * Returns null for anything that is not a 1-based integer inside the list — a bare word is a
 * title to match, not a position, and must not silently resolve to the wrong item.
 */
export function resolvePosition(itemIds: string[], token: string): string | null {
  const trimmed = token.trim();
  if (!POSITION_RE.test(trimmed)) return null;
  const index = Number(trimmed) - 1;
  return index < itemIds.length ? itemIds[index] : null;
}

/** Housekeeping. Returns the count deleted. */
export async function pruneMessageRefs(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MESSAGE_REF_TTL_MS);
  const { count } = await prisma.messageRef.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
