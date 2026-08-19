import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEmbeddingText, upsertItemEmbedding } from "@/lib/services/embeddings";
import { isAuthorizedCronRequest } from "@/lib/services/cron-utils";

export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.item.findMany({
    where: { parentId: null },
    include: { category: true },
  });

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const text = buildEmbeddingText({ title: item.title, description: item.description, category: item.category.name });
      await upsertItemEmbedding(item.id, text);
      processed++;
    } catch {
      failed++;
    }
    // Rate limit: ~100ms between requests to stay well within Gemini free tier limits
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({ processed, failed, total: items.length });
}
