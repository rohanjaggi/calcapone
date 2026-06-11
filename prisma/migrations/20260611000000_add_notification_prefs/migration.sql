-- AlterTable
ALTER TABLE "users" ADD COLUMN "quiet_start" TEXT;
ALTER TABLE "users" ADD COLUMN "quiet_end" TEXT;
ALTER TABLE "users" ADD COLUMN "notify_min_priority" "Priority" NOT NULL DEFAULT 'low';
ALTER TABLE "users" ADD COLUMN "digest_day" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "digest_time" TEXT NOT NULL DEFAULT '19:00';
