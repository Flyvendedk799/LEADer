-- Persist discovery queue order so priority survives server restarts/redeploys.
ALTER TABLE "DiscoveryMission" ADD COLUMN "queuePriority" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "DiscoveryMission_ownerId_status_queuePriority_startedAt_idx" ON "DiscoveryMission"("ownerId", "status", "queuePriority", "startedAt");
