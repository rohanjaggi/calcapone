-- pgvector for semantic search (column may already exist on databases that were patched by hand)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "embedding" vector(768);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "items_embedding_hnsw_idx" ON "items" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "items_remind_at_status_idx" ON "items"("remind_at", "status");
CREATE INDEX IF NOT EXISTS "items_user_id_status_due_date_idx" ON "items"("user_id", "status", "due_date");
CREATE INDEX IF NOT EXISTS "items_parent_id_idx" ON "items"("parent_id");
CREATE INDEX IF NOT EXISTS "items_user_id_category_id_idx" ON "items"("user_id", "category_id");
