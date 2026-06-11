import { prisma } from "@/lib/prisma";

const MAX_HISTORY = 10;
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function getRecentMessages(
  userId: string,
  chatId: number
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const cutoff = new Date(Date.now() - MAX_AGE_MS);

  const messages = await prisma.message.findMany({
    where: {
      userId,
      chatId: BigInt(chatId),
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY,
    select: { role: true, content: true },
  });

  const ordered = messages.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Coalesce consecutive same-role messages (Anthropic rejects them)
  const coalesced: typeof ordered = [];
  for (const msg of ordered) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content += `\n${msg.content}`;
    } else {
      coalesced.push(msg);
    }
  }
  return coalesced;
}

export async function saveMessage(
  userId: string,
  chatId: number,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await prisma.message.create({
    data: {
      userId,
      chatId: BigInt(chatId),
      role,
      content,
    },
  });
}

export async function pruneOldMessages(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.message.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
