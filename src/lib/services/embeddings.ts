import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";

let genai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!genai) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
    genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await getClient().models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: { outputDimensionality: 768 },
  });
  return result.embeddings![0].values!;
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

export async function upsertItemEmbedding(
  itemId: string,
  text: string
): Promise<void> {
  try {
    const embedding = await generateEmbedding(text);
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE items SET embedding = ${vectorStr}::vector WHERE id = ${itemId}::uuid
    `;
  } catch (e) {
    console.error("[embeddings] failed to upsert embedding:", e);
  }
}
