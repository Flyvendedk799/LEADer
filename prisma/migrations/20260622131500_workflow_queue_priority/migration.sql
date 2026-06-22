-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN "queuePriority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "WorkflowRun_ownerId_status_queuePriority_createdAt_idx" ON "WorkflowRun"("ownerId", "status", "queuePriority", "createdAt");
