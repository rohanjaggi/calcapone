-- Single-use nonces for in-flight Google OAuth flows.
CREATE TABLE "oauth_states" (
    "nonce" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states"("expires_at");
