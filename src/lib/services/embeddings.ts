import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Embeddings must all come from one model: the `items.embedding` column is a single
 * vector(768) space, and vectors from two different models are not comparable — mixing them
 * silently degrades search rather than failing. The provider is therefore chosen once from
 * the environment, and switching it means re-running /api/embeddings/backfill with `all`.
 */
export const EMBEDDING_DIMENSIONS = 768;

type Embedder = { provider: "gemini" | "openai"; embed: (text: string) => Promise<number[]> };

let cached: Embedder | null | undefined;

function buildEmbedder(): Embedder | null {
  if (process.env.GEMINI_API_KEY) {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return {
      provider: "gemini",
      embed: async (text) => {
        const result = await client.models.embedContent({
          model: "gemini-embedding-001",
          contents: text,
          config: { outputDimensionality: EMBEDDING_DIMENSIONS },
        });
        const values = result.embeddings?.[0]?.values;
        if (!values?.length) throw new Error("Gemini returned an empty embedding");
        return values;
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return {
      provider: "openai",
      embed: async (text) => {
        const result = await client.embeddings.create({
          model: "text-embedding-3-small",
          input: text,
          dimensions: EMBEDDING_DIMENSIONS,
        });
        const values = result.data?.[0]?.embedding;
        if (!values?.length) throw new Error("OpenAI returned an empty embedding");
        return values;
      },
    };
  }

  return null;
}

/** The configured embedder, or null when no embedding key is set (semantic search is then off). */
export function getEmbedder(): Embedder | null {
  if (cached === undefined) {
    cached = buildEmbedder();
    if (!cached) {
      console.warn(
        "[embeddings] neither GEMINI_API_KEY nor OPENAI_API_KEY is set — semantic search is disabled, keyword search still works"
      );
    }
  }
  return cached;
}

/** Test seam: forget the cached client so a changed environment is picked up. */
export function resetEmbedder(): void {
  cached = undefined;
}

export function isEmbeddingConfigured(): boolean {
  return getEmbedder() !== null;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embedder = getEmbedder();
  if (!embedder) throw new Error("No embedding provider configured (set GEMINI_API_KEY or OPENAI_API_KEY)");
  return embedder.embed(text);
}

export function buildEmbeddingText(item: {
  title: string;
  description?: string | null;
  category?: string | null;
}): string {
  const parts = [item.title];
  if (item.description) parts.push(item.description);
  if (item.category) parts.push(`category: ${item.category}`);
  return parts.join(" — ");
}

/** Write an item's embedding. Never throws: a missing embedding costs recall, not correctness. */
export async function upsertItemEmbedding(itemId: string, text: string): Promise<boolean> {
  if (!isEmbeddingConfigured()) return false;
  try {
    const embedding = await generateEmbedding(text);
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE items SET embedding = ${vectorStr}::vector WHERE id = ${itemId}::uuid
    `;
    return true;
  } catch (e) {
    console.error("[embeddings] failed to upsert embedding:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Queue an embedding write for after the response is sent.
 *
 * Fire-and-forget doesn't survive on Vercel — the function can freeze once it responds, so
 * the write silently never lands. `after()` keeps it alive; outside a request scope (cron
 * scripts, tests) `after` throws and we simply await instead.
 */
export async function scheduleItemEmbedding(itemId: string, text: string): Promise<void> {
  try {
    after(() => upsertItemEmbedding(itemId, text));
  } catch {
    await upsertItemEmbedding(itemId, text);
  }
}
