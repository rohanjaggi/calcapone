-- Three dead pieces of schema go:
--  * items.google_event_id / items.calendar_synced_at: no code path has created a task linked to
--    a Google event since POST /api/items was removed (0 linked rows when this was written).
--  * items.recurring: the legacy daily/weekly/monthly enum, folded into recurrence_rule below.
--  * cron_heartbeat: written by nothing since tick-gap alerting was removed.

-- Fold the legacy enum into recurrence_rule, using the exact rule text the code derived from it.
UPDATE "items" SET "recurrence_rule" = 'FREQ=' || upper("recurring"::text)
WHERE "recurrence_rule" IS NULL AND "recurring" <> 'none';

-- Every rule-based item names its own series (createItem does this on insert); converted rows need it too.
UPDATE "items" SET "series_id" = "id"
WHERE "recurrence_rule" IS NOT NULL AND "series_id" IS NULL;

-- AlterTable
ALTER TABLE "items" DROP COLUMN "calendar_synced_at",
DROP COLUMN "google_event_id",
DROP COLUMN "recurring";

-- DropTable
DROP TABLE "cron_heartbeat";

-- DropEnum
DROP TYPE "RecurringType";
