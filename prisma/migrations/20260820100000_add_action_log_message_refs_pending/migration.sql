-- CreateTable
CREATE TABLE IF NOT EXISTS "action_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chat_id" BIGINT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "inverse" JSONB NOT NULL,
    "undone_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "message_refs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "message_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "item_ids" UUID[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pending_actions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "candidates" UUID[],
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "action_log_user_id_undone_at_created_at_idx" ON "action_log"("user_id", "undone_at", "created_at");
CREATE INDEX IF NOT EXISTS "action_log_created_at_idx" ON "action_log"("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "message_refs_chat_id_message_id_key" ON "message_refs"("chat_id", "message_id");
CREATE INDEX IF NOT EXISTS "message_refs_user_id_chat_id_kind_created_at_idx" ON "message_refs"("user_id", "chat_id", "kind", "created_at");
CREATE INDEX IF NOT EXISTS "message_refs_created_at_idx" ON "message_refs"("created_at");
CREATE INDEX IF NOT EXISTS "pending_actions_expires_at_idx" ON "pending_actions"("expires_at");

-- AddForeignKey
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_refs" ADD CONSTRAINT "message_refs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
