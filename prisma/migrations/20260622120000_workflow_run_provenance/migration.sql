-- AlterTable
ALTER TABLE "WorkflowRun"
ADD COLUMN "presetId" TEXT,
ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE INDEX "WorkflowRun_ownerId_trigger_idx" ON "WorkflowRun"("ownerId", "trigger");

-- CreateIndex
CREATE INDEX "WorkflowRun_presetId_idx" ON "WorkflowRun"("presetId");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "WorkflowPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
