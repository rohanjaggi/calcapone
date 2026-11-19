-- Dashboard rework and cleanup.
--
-- DESTRUCTIVE. Drops the courses table, items.kind, items.course_id and the ItemKind enum:
-- the school subsystem was removed, and school work now lives in the seeded "School"
-- category as ordinary tasks. Any data in those columns is lost. Snapshot first.
--
-- Also drops users.ai_suggestion_enabled (the dashboard AI recommendation card is gone) and
-- adds cron_heartbeat, which records when each cron job last ran so a tick can notice that
-- the scheduler stopped.

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_course_id_fkey";

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_user_id_fkey";

-- DropIndex
DROP INDEX "items_user_id_kind_due_date_idx";

-- DropIndex
DROP INDEX "items_course_id_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "ai_suggestion_enabled";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "course_id",
DROP COLUMN "kind";

-- DropTable
DROP TABLE "courses";

-- DropEnum
DROP TYPE "ItemKind";

-- CreateTable
CREATE TABLE "cron_heartbeat" (
    "job" TEXT NOT NULL,
    "last_tick_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cron_heartbeat_pkey" PRIMARY KEY ("job")
);

