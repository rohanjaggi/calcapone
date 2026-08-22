-- CreateTable
CREATE TABLE "cron_heartbeat" (
    "job" TEXT NOT NULL,
    "last_tick_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cron_heartbeat_pkey" PRIMARY KEY ("job")
);

