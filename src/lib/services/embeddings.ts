import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await genai.models.embedContent({
    model: "text-embedding-004",
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
  } catch {
    // Embedding failure is non-fatal — keyword search still works
  }
}
