import { prisma } from "@/lib/prisma";
import { generateEmbedding, isEmbeddingConfigured } from "@/lib/services/embeddings";

type SearchResult = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: { id: string; name: string; color: string };
  dueDate: string | null;
  type: "task" | "reminder";
};

async function keywordSearch(userId: string, query: string): Promise<SearchResult[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const items = await prisma.item.findMany({
    where: {
      userId,
      parentId: null,
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" as const } },
        { description: { contains: term, mode: "insensitive" as const } },
      ]),
    },
    include: { category: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 20,
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: item.category.id, name: item.category.name, color: item.category.color ?? "#A8A29E" },
    dueDate: item.dueDate,
    type: item.remindAt ? ("reminder" as const) : ("task" as const),
  }));
}

function recencyDecay(updatedAt: Date): number {
  const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - daysSince / 30);
}

function statusBoost(status: string): number {
  if (status === "pending") return 1;
  if (status === "in_progress") return 0.8;
  return 0.2;
}

function hybridScore(similarity: number, updatedAt: Date, status: string): number {
  return 0.7 * similarity + 0.2 * recencyDecay(updatedAt) + 0.1 * statusBoost(status);
}

/**
 * Vector search over item embeddings. Returns [] on failure — semantic results are a bonus
 * on top of keyword search — but logs first: swallowing silently meant a missing API key or
 * a dropped pgvector index looked exactly like "no similar items".
 */
async function semanticSearch(userId: string, query: string): Promise<SearchResult[]> {
  if (!isEmbeddingConfigured()) return [];
  try {
    const embedding = await generateEmbedding(query);
    const vectorStr = `[${embedding.join(",")}]`;

    const matches: Array<{ id: string; similarity: number }> = await prisma.$queryRaw`
      SELECT id::text, 1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM items
      WHERE user_id = ${userId}::uuid
        AND parent_id IS NULL
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorStr}::vector) > 0.3
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT 20
    `;

    if (matches.length === 0) return [];

    const ids = matches.map((m) => m.id);
    const items = await prisma.item.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });

    const similarityMap = new Map(matches.map((m) => [m.id, m.similarity]));
    items.sort((a, b) => {
      const scoreA = hybridScore(similarityMap.get(a.id) ?? 0, a.updatedAt, a.status);
      const scoreB = hybridScore(similarityMap.get(b.id) ?? 0, b.updatedAt, b.status);
      return scoreB - scoreA;
    });

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      category: { id: item.category.id, name: item.category.name, color: item.category.color ?? "#A8A29E" },
      dueDate: item.dueDate,
      type: item.remindAt ? ("reminder" as const) : ("task" as const),
    }));
  } catch (error) {
    console.error("[search] semantic search failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function searchItems(userId: string, query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const keywordResults = await keywordSearch(userId, query);

  if (keywordResults.length >= 3) return keywordResults;

  const semanticResults = await semanticSearch(userId, query);

  // Merge: keyword results first (exact matches are high confidence), then semantic results not already present
  const seenIds = new Set(keywordResults.map((r) => r.id));
  const merged = [...keywordResults];
  for (const result of semanticResults) {
    if (!seenIds.has(result.id)) {
      merged.push(result);
      seenIds.add(result.id);
    }
  }

  return merged.slice(0, 20);
}
