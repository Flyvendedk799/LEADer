-- CreateTable
CREATE TABLE "WorkflowPresetEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "runId" TEXT,
    "eventType" TEXT NOT NULL,
    "reason" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowPresetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowPresetEvent_ownerId_createdAt_idx" ON "WorkflowPresetEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowPresetEvent_presetId_createdAt_idx" ON "WorkflowPresetEvent"("presetId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowPresetEvent_runId_idx" ON "WorkflowPresetEvent"("runId");

-- CreateIndex
CREATE INDEX "WorkflowPresetEvent_ownerId_eventType_idx" ON "WorkflowPresetEvent"("ownerId", "eventType");

-- AddForeignKey
ALTER TABLE "WorkflowPresetEvent" ADD CONSTRAINT "WorkflowPresetEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPresetEvent" ADD CONSTRAINT "WorkflowPresetEvent_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "WorkflowPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPresetEvent" ADD CONSTRAINT "WorkflowPresetEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
