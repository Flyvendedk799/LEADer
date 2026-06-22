-- CreateTable
CREATE TABLE "WorkflowPreset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "playbook" TEXT NOT NULL,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "options" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "lastQueuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPreset_ownerId_name_key" ON "WorkflowPreset"("ownerId", "name");

-- CreateIndex
CREATE INDEX "WorkflowPreset_ownerId_pinned_idx" ON "WorkflowPreset"("ownerId", "pinned");

-- CreateIndex
CREATE INDEX "WorkflowPreset_ownerId_updatedAt_idx" ON "WorkflowPreset"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "WorkflowPreset" ADD CONSTRAINT "WorkflowPreset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
