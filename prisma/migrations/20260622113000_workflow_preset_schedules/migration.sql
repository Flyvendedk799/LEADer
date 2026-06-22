-- AlterTable
ALTER TABLE "WorkflowPreset"
ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduleIntervalHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "scheduleNextRunAt" TIMESTAMP(3),
ADD COLUMN "lastScheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkflowPreset_ownerId_scheduleEnabled_scheduleNextRunAt_idx" ON "WorkflowPreset"("ownerId", "scheduleEnabled", "scheduleNextRunAt");
