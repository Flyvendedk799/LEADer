-- Sealed credential storage for @flyvendedk799/ai-auth (per-user Claude subscriptions).
-- `payload` is ciphertext; `meta` holds only non-secret display facts (plan, expiry).
CREATE TABLE "AiCredential" (
    "key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredential_pkey" PRIMARY KEY ("key")
);
