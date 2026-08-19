-- AlterTable: cron "last sent" state + trial quota counters
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_briefing_sent_on" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_digest_sent_on" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_calls_date" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_calls_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: webhook idempotency
CREATE TABLE IF NOT EXISTS "telegram_updates" (
    "update_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("update_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "telegram_updates_created_at_idx" ON "telegram_updates"("created_at");
