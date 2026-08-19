-- Category gained an updatedAt to match every other model.
ALTER TABLE "categories" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- pruneOldMessages filters on created_at alone; the existing (user_id, chat_id, created_at)
-- index is unusable for that because created_at isn't the leading column.
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");
