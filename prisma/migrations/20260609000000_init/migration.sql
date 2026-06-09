-- CreateEnum
CREATE TYPE "Workspace" AS ENUM ('DK', 'GLOBAL');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PUBLIC_WEB', 'RSS', 'PROCUREMENT', 'ACCELERATOR', 'NEWSLETTER', 'API', 'FACEBOOK_MANUAL', 'UPLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "MonitorFrequency" AS ENUM ('MANUAL', 'HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'INTERESTING', 'WATCH', 'CONTACTED', 'APPLIED', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationRoute" AS ENUM ('DIRECT', 'APPLICATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IngestMethod" AS ENUM ('AUTOMATED', 'MANUAL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('SUMMARY', 'APPLICATION', 'PITCH', 'EMAIL', 'CHECKLIST', 'COMPARISON', 'EXPLANATION');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'STATUS_CHANGE', 'NOTE', 'AI_DRAFT', 'SCORE', 'EXPORT', 'REMINDER', 'IMPORT', 'UPDATE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('DEADLINE', 'NEW_HIGH_MATCH', 'DIGEST', 'NEEDS_ACTION');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('LOCAL', 'EMAIL');

-- CreateEnum
CREATE TYPE "CommunityImportStatus" AS ENUM ('PENDING', 'EXTRACTED', 'CONFIRMED', 'DISCARDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "preferredProjectTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetMaxDkk" INTEGER NOT NULL DEFAULT 100000,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'DKK',
    "scoringWeights" JSONB,
    "exportPrefs" JSONB,
    "aiKeys" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "type" "SourceType" NOT NULL,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "frequency" "MonitorFrequency" NOT NULL DEFAULT 'DAILY',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT DEFAULT 'DK',
    "region" TEXT,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parserKey" TEXT,
    "robotsAllowed" BOOLEAN,
    "lastCheckedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rawContent" TEXT,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "currency" TEXT DEFAULT 'DKK',
    "deadline" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "url" TEXT,
    "organization" TEXT,
    "location" TEXT,
    "country" TEXT DEFAULT 'DK',
    "region" TEXT,
    "category" TEXT,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "applicationRoute" "ApplicationRoute" NOT NULL DEFAULT 'UNKNOWN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "ingestMethod" "IngestMethod" NOT NULL DEFAULT 'MANUAL',
    "matchScore" INTEGER,
    "scoreBreakdown" JSONB,
    "aiSummary" TEXT,
    "whyRelevant" TEXT,
    "nextAction" TEXT,
    "extractedRequirements" JSONB,
    "dedupeHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "organization" TEXT,
    "linkedin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityTag" (
    "opportunityId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "OpportunityTag_pkey" PRIMARY KEY ("opportunityId","tagId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "DraftKind" NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "promptSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "reminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityImport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "groupName" TEXT,
    "author" TEXT,
    "postDate" TIMESTAMP(3),
    "url" TEXT,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "status" "CommunityImportStatus" NOT NULL DEFAULT 'PENDING',
    "extracted" JSONB,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "log" TEXT,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "channel" "AlertChannel" NOT NULL DEFAULT 'LOCAL',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Source_ownerId_enabled_idx" ON "Source"("ownerId", "enabled");

-- CreateIndex
CREATE INDEX "Source_workspace_idx" ON "Source"("workspace");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_dedupeHash_key" ON "Opportunity"("dedupeHash");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_status_idx" ON "Opportunity"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_workspace_idx" ON "Opportunity"("ownerId", "workspace");

-- CreateIndex
CREATE INDEX "Opportunity_matchScore_idx" ON "Opportunity"("matchScore");

-- CreateIndex
CREATE INDEX "Opportunity_deadline_idx" ON "Opportunity"("deadline");

-- CreateIndex
CREATE INDEX "Opportunity_sourceId_idx" ON "Opportunity"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Activity_opportunityId_createdAt_idx" ON "Activity"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "Draft_opportunityId_kind_idx" ON "Draft"("opportunityId", "kind");

-- CreateIndex
CREATE INDEX "List_ownerId_idx" ON "List"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ListItem_listId_opportunityId_key" ON "ListItem"("listId", "opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_opportunityId_key" ON "WatchlistItem"("opportunityId");

-- CreateIndex
CREATE INDEX "WatchlistItem_ownerId_idx" ON "WatchlistItem"("ownerId");

-- CreateIndex
CREATE INDEX "SavedSearch_ownerId_idx" ON "SavedSearch"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityImport_opportunityId_key" ON "CommunityImport"("opportunityId");

-- CreateIndex
CREATE INDEX "CommunityImport_ownerId_status_idx" ON "CommunityImport"("ownerId", "status");

-- CreateIndex
CREATE INDEX "DiscoveryRun_sourceId_startedAt_idx" ON "DiscoveryRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "Alert_ownerId_read_idx" ON "Alert"("ownerId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityTag" ADD CONSTRAINT "OpportunityTag_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityTag" ADD CONSTRAINT "OpportunityTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityImport" ADD CONSTRAINT "CommunityImport_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

