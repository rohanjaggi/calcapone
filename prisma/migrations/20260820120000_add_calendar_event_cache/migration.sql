-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_sync_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_calendar_sync_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "event_reminder_minutes" INTEGER;

-- AlterTable
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "calendar_synced_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE IF NOT EXISTS "calendar_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "transparent" BOOLEAN NOT NULL DEFAULT false,
    "google_updated_at" TIMESTAMPTZ,
    "reminder_sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_user_id_google_event_id_key" ON "calendar_events"("user_id", "google_event_id");
CREATE INDEX IF NOT EXISTS "calendar_events_user_id_starts_at_idx" ON "calendar_events"("user_id", "starts_at");
CREATE INDEX IF NOT EXISTS "calendar_events_starts_at_reminder_sent_at_idx" ON "calendar_events"("starts_at", "reminder_sent_at");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
