-- AlterTable
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_rule" TEXT;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_end" TIMESTAMPTZ;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "google_event_id" TEXT;
