ALTER TABLE "DiscoveryCandidate" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
CREATE INDEX "DiscoveryCandidate_review_snooze" ON "DiscoveryCandidate" ("ownerId", "status", "snoozedUntil");
