ALTER TABLE "User" ALTER COLUMN "budgetMaxDkk" SET DEFAULT 0;
ALTER TABLE "DiscoveryMission" ADD COLUMN "leaseToken" TEXT, ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkflowRun" ADD COLUMN "leaseToken" TEXT, ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "DiscoveryMission_worker_claim" ON "DiscoveryMission" ("status", "leaseUntil", "queuePriority");
CREATE INDEX "WorkflowRun_worker_claim" ON "WorkflowRun" ("status", "leaseUntil", "queuePriority");
CREATE TABLE "WorkerHeartbeat" ("id" TEXT PRIMARY KEY, "updatedAt" TIMESTAMP(3) NOT NULL);
ALTER TABLE "User" ADD COLUMN "companyProfile" JSONB;
CREATE TABLE "ProviderUsage" ("id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE, "kind" TEXT NOT NULL, "units" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ProviderUsage_owner_kind_created" ON "ProviderUsage" ("ownerId", "kind", "createdAt");
