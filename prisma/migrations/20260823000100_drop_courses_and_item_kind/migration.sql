-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_course_id_fkey";

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_user_id_fkey";

-- DropIndex
DROP INDEX "items_user_id_kind_due_date_idx";

-- DropIndex
DROP INDEX "items_course_id_idx";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "course_id",
DROP COLUMN "kind";

-- DropTable
DROP TABLE "courses";

-- DropEnum
DROP TYPE "ItemKind";

