import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEmbeddingText, upsertItemEmbedding, isEmbeddingConfigured } from "@/lib/services/embeddings";
import { isAuthorizedCronRequest } from "@/lib/services/cron-utils";

export const maxDuration = 300;

/** Concurrent embedding calls. Enough to be quick, low enough to stay under provider rate limits. */
const CONCURRENCY = 5;
const DEFAULT_LIMIT = 500;

/**
 * Backfill missing item embeddings.
 *
 * By default only rows with no embedding are processed, so re-running is cheap and safe —
 * the previous version re-embedded the entire table on every call. Pass `{"all": true}` to
 * rebuild everything, which is what you want after changing embedding provider or model.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      { error: "No embedding provider configured (set GEMINI_API_KEY or OPENAI_API_KEY)" },
      { status: 503 }
    );
  }

  let all = false;
  let limit = DEFAULT_LIMIT;
  try {
    const body = await req.json();
    all = body?.all === true;
    if (Number.isInteger(body?.limit) && body.limit > 0) limit = Math.min(body.limit, 5000);
  } catch {
    // no body — defaults are fine
  }

  const ids: Array<{ id: string }> = all
    ? await prisma.$queryRaw`SELECT id::text FROM items WHERE parent_id IS NULL LIMIT ${limit}`
    : await prisma.$queryRaw`SELECT id::text FROM items WHERE parent_id IS NULL AND embedding IS NULL LIMIT ${limit}`;

  const items = await prisma.item.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    include: { category: true },
  });

  let processed = 0;
  let failed = 0;

  // Bounded concurrency: workers pull from a shared cursor rather than firing all at once.
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      const text = buildEmbeddingText({
        title: item.title,
        description: item.description,
        category: item.category.name,
      });
      if (await upsertItemEmbedding(item.id, text)) processed++;
      else failed++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

  return NextResponse.json({
    processed,
    failed,
    total: items.length,
    remaining: items.length === limit ? "more may remain — run again" : 0,
  });
}
