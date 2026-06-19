-- Persist lightweight search feedback so Discover can learn from review
-- decisions without requiring an opportunity to be created first.
CREATE TYPE "DiscoveryFeedbackType" AS ENUM ('GOOD_RESULT', 'NON_LEAD');

CREATE TABLE "DiscoveryFeedback" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "candidateKind" TEXT,
    "feedback" "DiscoveryFeedbackType" NOT NULL,
    "reason" TEXT,
    "sourceName" TEXT,
    "provider" TEXT,
    "query" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscoveryFeedback_ownerId_candidateId_key" ON "DiscoveryFeedback"("ownerId", "candidateId");
CREATE INDEX "DiscoveryFeedback_ownerId_feedback_idx" ON "DiscoveryFeedback"("ownerId", "feedback");
CREATE INDEX "DiscoveryFeedback_ownerId_url_idx" ON "DiscoveryFeedback"("ownerId", "url");

ALTER TABLE "DiscoveryFeedback"
ADD CONSTRAINT "DiscoveryFeedback_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
