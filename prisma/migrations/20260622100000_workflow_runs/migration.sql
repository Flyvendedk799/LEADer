-- Persist queued/background workflow playbook runs with durable logs.
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "playbook" TEXT NOT NULL,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "result" JSONB,
    "log" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowRun_ownerId_createdAt_idx" ON "WorkflowRun"("ownerId", "createdAt");
CREATE INDEX "WorkflowRun_ownerId_status_idx" ON "WorkflowRun"("ownerId", "status");

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
