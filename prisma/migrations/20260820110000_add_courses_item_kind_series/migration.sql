-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ItemKind" AS ENUM ('task', 'assignment', 'exam', 'class');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "courses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "courses_user_id_code_key" ON "courses"("user_id", "code");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "kind" "ItemKind" NOT NULL DEFAULT 'task';
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "course_id" UUID;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "series_id" UUID;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "items_user_id_kind_due_date_idx" ON "items"("user_id", "kind", "due_date");
CREATE INDEX IF NOT EXISTS "items_course_id_idx" ON "items"("course_id");
CREATE INDEX IF NOT EXISTS "items_series_id_idx" ON "items"("series_id");
