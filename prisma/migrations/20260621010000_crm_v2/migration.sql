-- LEADer V2 — personal client-acquisition CRM foundation.
-- Adds accounts, people, deals, discovery lanes/candidates/evidence, tasks,
-- touchpoints and conversion assets while preserving legacy Opportunity rows.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('COMPANY', 'STARTUP', 'PUBLIC_BUYER', 'COMMUNITY', 'PARTNER', 'PERSONA', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DISCOVERED', 'QUALIFYING', 'INTERESTING', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscoveryCandidateStatus" AS ENUM ('NEW', 'REVIEWED', 'SAVED', 'DISMISSED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('SOURCE_SNIPPET', 'WEB_RESULT', 'STRUCTURED_DATA', 'AI_EXTRACT', 'USER_NOTE');

-- CreateEnum
CREATE TYPE "TouchpointKind" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'COMMUNITY', 'MESSAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ConversionAssetKind" AS ENUM ('OUTREACH', 'PROPOSAL', 'FOLLOW_UP', 'CHECKLIST', 'CALL_PREP', 'PITCH', 'SUMMARY');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'UNKNOWN',
    "website" TEXT,
    "domain" TEXT,
    "description" TEXT,
    "country" TEXT,
    "region" TEXT,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "source" TEXT,
    "fitScore" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryLane" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceTypes" "SourceType"[] DEFAULT ARRAY[]::"SourceType"[],
    "queryTemplates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "positiveKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "negativeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scoringConfig" JSONB,
    "evidenceRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conversionGuidance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryLane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "sourceId" TEXT,
    "laneId" TEXT,
    "legacyOpportunityId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "rawContent" TEXT,
    "valueMin" INTEGER,
    "valueMax" INTEGER,
    "currency" TEXT DEFAULT 'DKK',
    "deadline" TIMESTAMP(3),
    "status" "DealStatus" NOT NULL DEFAULT 'DISCOVERED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "category" TEXT,
    "applicationRoute" "ApplicationRoute" NOT NULL DEFAULT 'UNKNOWN',
    "url" TEXT,
    "matchScore" INTEGER,
    "confidenceScore" INTEGER,
    "pursuitScore" INTEGER,
    "qualification" JSONB,
    "nextAction" TEXT,
    "statusReason" TEXT,
    "wonLostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealPerson" (
    "dealId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealPerson_pkey" PRIMARY KEY ("dealId","personId")
);

-- CreateTable
CREATE TABLE "DiscoveryMission" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceScanCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryCandidate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "laneId" TEXT,
    "missionId" TEXT,
    "accountId" TEXT,
    "dealId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rawContent" TEXT,
    "url" TEXT,
    "organization" TEXT,
    "workspace" "Workspace" NOT NULL DEFAULT 'DK',
    "sourceName" TEXT,
    "sourceKind" TEXT,
    "provider" TEXT,
    "query" TEXT,
    "category" TEXT,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "currency" TEXT DEFAULT 'DKK',
    "deadline" TIMESTAMP(3),
    "applicationRoute" "ApplicationRoute" NOT NULL DEFAULT 'UNKNOWN',
    "status" "DiscoveryCandidateStatus" NOT NULL DEFAULT 'NEW',
    "matchScore" INTEGER,
    "confidenceScore" INTEGER,
    "pursuitScore" INTEGER,
    "scoreBreakdown" JSONB,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedback" JSONB,
    "dismissalReason" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "candidateId" TEXT,
    "dealId" TEXT,
    "accountId" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "snippet" TEXT NOT NULL,
    "sourceName" TEXT,
    "provider" TEXT,
    "confidence" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Touchpoint" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "dealId" TEXT,
    "personId" TEXT,
    "kind" "TouchpointKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "outcome" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "dealId" TEXT,
    "personId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "dealId" TEXT,
    "candidateId" TEXT,
    "kind" "ConversionAssetKind" NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "promptSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_ownerId_name_key" ON "Account"("ownerId", "name");
CREATE INDEX "Account_ownerId_workspace_idx" ON "Account"("ownerId", "workspace");
CREATE INDEX "Account_ownerId_type_idx" ON "Account"("ownerId", "type");
CREATE UNIQUE INDEX "Person_ownerId_email_key" ON "Person"("ownerId", "email");
CREATE INDEX "Person_ownerId_idx" ON "Person"("ownerId");
CREATE INDEX "Person_accountId_idx" ON "Person"("accountId");
CREATE UNIQUE INDEX "DiscoveryLane_ownerId_slug_key" ON "DiscoveryLane"("ownerId", "slug");
CREATE INDEX "DiscoveryLane_ownerId_active_idx" ON "DiscoveryLane"("ownerId", "active");
CREATE UNIQUE INDEX "Deal_legacyOpportunityId_key" ON "Deal"("legacyOpportunityId");
CREATE INDEX "Deal_ownerId_status_idx" ON "Deal"("ownerId", "status");
CREATE INDEX "Deal_ownerId_workspace_idx" ON "Deal"("ownerId", "workspace");
CREATE INDEX "Deal_accountId_idx" ON "Deal"("accountId");
CREATE INDEX "Deal_deadline_idx" ON "Deal"("deadline");
CREATE INDEX "Deal_pursuitScore_idx" ON "Deal"("pursuitScore");
CREATE INDEX "DealPerson_personId_idx" ON "DealPerson"("personId");
CREATE INDEX "DiscoveryMission_ownerId_startedAt_idx" ON "DiscoveryMission"("ownerId", "startedAt");
CREATE INDEX "DiscoveryMission_laneId_startedAt_idx" ON "DiscoveryMission"("laneId", "startedAt");
CREATE INDEX "DiscoveryCandidate_ownerId_status_idx" ON "DiscoveryCandidate"("ownerId", "status");
CREATE INDEX "DiscoveryCandidate_ownerId_workspace_idx" ON "DiscoveryCandidate"("ownerId", "workspace");
CREATE INDEX "DiscoveryCandidate_laneId_idx" ON "DiscoveryCandidate"("laneId");
CREATE INDEX "DiscoveryCandidate_missionId_idx" ON "DiscoveryCandidate"("missionId");
CREATE INDEX "DiscoveryCandidate_pursuitScore_idx" ON "DiscoveryCandidate"("pursuitScore");
CREATE INDEX "Evidence_ownerId_idx" ON "Evidence"("ownerId");
CREATE INDEX "Evidence_candidateId_idx" ON "Evidence"("candidateId");
CREATE INDEX "Evidence_dealId_idx" ON "Evidence"("dealId");
CREATE INDEX "Evidence_accountId_idx" ON "Evidence"("accountId");
CREATE INDEX "Touchpoint_ownerId_occurredAt_idx" ON "Touchpoint"("ownerId", "occurredAt");
CREATE INDEX "Touchpoint_accountId_idx" ON "Touchpoint"("accountId");
CREATE INDEX "Touchpoint_dealId_idx" ON "Touchpoint"("dealId");
CREATE INDEX "Touchpoint_personId_idx" ON "Touchpoint"("personId");
CREATE INDEX "Task_ownerId_status_idx" ON "Task"("ownerId", "status");
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");
CREATE INDEX "Task_dealId_idx" ON "Task"("dealId");
CREATE INDEX "Task_accountId_idx" ON "Task"("accountId");
CREATE INDEX "ConversionAsset_ownerId_idx" ON "ConversionAsset"("ownerId");
CREATE INDEX "ConversionAsset_dealId_idx" ON "ConversionAsset"("dealId");
CREATE INDEX "ConversionAsset_accountId_idx" ON "ConversionAsset"("accountId");
CREATE INDEX "ConversionAsset_candidateId_idx" ON "ConversionAsset"("candidateId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryLane" ADD CONSTRAINT "DiscoveryLane_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "DiscoveryLane"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_legacyOpportunityId_fkey" FOREIGN KEY ("legacyOpportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealPerson" ADD CONSTRAINT "DealPerson_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealPerson" ADD CONSTRAINT "DealPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryMission" ADD CONSTRAINT "DiscoveryMission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryMission" ADD CONSTRAINT "DiscoveryMission_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "DiscoveryLane"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "DiscoveryLane"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DiscoveryMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DiscoveryCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionAsset" ADD CONSTRAINT "ConversionAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversionAsset" ADD CONSTRAINT "ConversionAsset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionAsset" ADD CONSTRAINT "ConversionAsset_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionAsset" ADD CONSTRAINT "ConversionAsset_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DiscoveryCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the six default personal acquisition lanes for every existing user.
INSERT INTO "DiscoveryLane" (
  "id", "ownerId", "slug", "name", "description", "workspace", "sourceTypes",
  "queryTemplates", "positiveKeywords", "negativeKeywords", "scoringConfig",
  "evidenceRequirements", "conversionGuidance", "createdAt", "updatedAt"
)
SELECT
  'lane_' || md5(u."id" || ':funded-work'),
  u."id",
  'funded-work',
  'Funded work',
  'Grants, vouchers and procurement-like supplier assignments that can convert into scoped technical projects.',
  'DK'::"Workspace",
  ARRAY['PUBLIC_WEB','RSS','PROCUREMENT','ACCELERATOR','NEWSLETTER']::"SourceType"[],
  ARRAY[
    'funded software MVP AI automation voucher Denmark',
    'SMV Digital digitalisering rådgiver software AI',
    'InnoBooster startup technical supplier MVP'
  ],
  ARRAY['voucher','tilskud','grant','funded','MVP','AI','software','automation'],
  ARRAY['unpaid','equity only','masterclass','training only'],
  '{"budgetFit":1,"deadline":1,"fundingSignal":1}'::jsonb,
  ARRAY['budget or funding signal','deadline or active call','clear buyer or programme'],
  'Emphasize your track record landing funded customers, tight scoping, and low-risk delivery.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("ownerId", "slug") DO NOTHING;

INSERT INTO "DiscoveryLane" (
  "id", "ownerId", "slug", "name", "description", "workspace", "sourceTypes",
  "queryTemplates", "positiveKeywords", "negativeKeywords", "scoringConfig",
  "evidenceRequirements", "conversionGuidance", "createdAt", "updatedAt"
)
SELECT
  'lane_' || md5(u."id" || ':direct-startup-mvp'),
  u."id",
  'direct-startup-mvp',
  'Direct startup / MVP clients',
  'Founders and early teams that need a builder, technical partner or product-minded MVP sprint.',
  'DK'::"Workspace",
  ARRAY['PUBLIC_WEB','ACCELERATOR','NEWSLETTER','MANUAL']::"SourceType"[],
  ARRAY[
    'startup founder needs MVP developer Denmark',
    'founder looking for technical partner prototype AI',
    'pre-seed startup product roadmap fullstack'
  ],
  ARRAY['founder','startup','MVP','prototype','technical partner','fullstack','roadmap'],
  ARRAY['cofounder only','internship','job posting only'],
  '{"founderIntent":1,"technicalNeed":1,"budgetClarity":0.7}'::jsonb,
  ARRAY['explicit product or technical need','reachable founder/company','reason to act now'],
  'Lead with rapid product clarity, senior technical judgment and an MVP path that does not overbuild.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("ownerId", "slug") DO NOTHING;

INSERT INTO "DiscoveryLane" (
  "id", "ownerId", "slug", "name", "description", "workspace", "sourceTypes",
  "queryTemplates", "positiveKeywords", "negativeKeywords", "scoringConfig",
  "evidenceRequirements", "conversionGuidance", "createdAt", "updatedAt"
)
SELECT
  'lane_' || md5(u."id" || ':sme-ai-automation'),
  u."id",
  'sme-ai-automation',
  'SME AI automation',
  'SMEs with workflow, data, reporting, internal-tooling or LLM automation pain.',
  'DK'::"Workspace",
  ARRAY['PUBLIC_WEB','RSS','NEWSLETTER','MANUAL']::"SourceType"[],
  ARRAY[
    'SME AI automation workflow Denmark',
    'company wants automate reporting data dashboard',
    'digitalisering AI chatbot internal tools SME'
  ],
  ARRAY['automation','AI','workflow','reporting','dashboard','internal tool','digitalisering'],
  ARRAY['course','conference','webinar','hardware only'],
  '{"painSignal":1,"automationFit":1,"reachableBuyer":0.8}'::jsonb,
  ARRAY['business pain','automation or data need','reachable buyer'],
  'Position a small proof-of-value sprint before a larger system build.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("ownerId", "slug") DO NOTHING;

INSERT INTO "DiscoveryLane" (
  "id", "ownerId", "slug", "name", "description", "workspace", "sourceTypes",
  "queryTemplates", "positiveKeywords", "negativeKeywords", "scoringConfig",
  "evidenceRequirements", "conversionGuidance", "createdAt", "updatedAt"
)
SELECT
  'lane_' || md5(u."id" || ':tenders-procurement'),
  u."id",
  'tenders-procurement',
  'Tenders / procurement',
  'Formal public or private procurement opportunities that match a solo/small technical supplier.',
  'DK'::"Workspace",
  ARRAY['PROCUREMENT','PUBLIC_WEB','RSS']::"SourceType"[],
  ARRAY[
    'udbud software udvikling webapp AI Danmark',
    'procurement tender small IT development Denmark',
    'offentlig digitalisering udvikler konsulent udbud'
  ],
  ARRAY['udbud','tender','procurement','software','IT','webapp','digitalisering'],
  ARRAY['rammeaftale','enterprise','million','hardware'],
  '{"formalFit":1,"scopeFit":1,"deadline":1}'::jsonb,
  ARRAY['scope','submission route','deadline','buyer'],
  'Only pursue when scope is small enough and the submission overhead is justified.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("ownerId", "slug") DO NOTHING;

INSERT INTO "DiscoveryLane" (
  "id", "ownerId", "slug", "name", "description", "workspace", "sourceTypes",
  "queryTemplates", "positiveKeywords", "negativeKeywords", "scoringConfig",
  "evidenceRequirements", "conversionGuidance", "createdAt", "updatedAt"
)
SELECT
  'lane_' || md5(u."id" || ':community-manual'),
  u."id",
  'community-manual',
  'Community / manual leads',
  'Manual-only posts, communities and user-captured leads. This lane is never server-scraped.',
  'DK'::"Workspace",
  ARRAY['FACEBOOK_MANUAL','UPLOAD','MANUAL']::"SourceType"[],
  ARRAY['manual paste founder post MVP developer', 'community lead technical help startup'],
  ARRAY['looking for','MVP','developer','AI','automation','founder'],
  ARRAY['job ad','unpaid','equity only'],
  '{"manualSignal":1,"contactability":1}'::jsonb,
  ARRAY['user-supplied content','contact or author','explicit need'],
  'Use the human context from the post and respond with a specific, low-friction next step.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("ownerId", "slug") DO NOTHING;

INSERT INTO "DiscoveryLane" (
  "id", "ownerId", "slug", "name", "description", "workspace", "sourceTypes",
  "queryTemplates", "positiveKeywords", "negativeKeywords", "scoringConfig",
  "evidenceRequirements", "conversionGuidance", "createdAt", "updatedAt"
)
SELECT
  'lane_' || md5(u."id" || ':warm-network'),
  u."id",
  'warm-network',
  'Warm-network follow-ups',
  'Dormant relationships, past customers and known contacts that deserve a timely follow-up.',
  'DK'::"Workspace",
  ARRAY['MANUAL','NEWSLETTER']::"SourceType"[],
  ARRAY['past customer follow-up AI automation', 'warm lead product roadmap check-in'],
  ARRAY['past customer','warm intro','follow-up','dormant','referral'],
  ARRAY['cold scraped','mass campaign'],
  '{"relationshipWarmth":1,"timing":1}'::jsonb,
  ARRAY['relationship context','reason to reconnect','clear next action'],
  'Reference the relationship and propose a useful, specific conversation rather than a generic sales pitch.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("ownerId", "slug") DO NOTHING;

-- Backfill Accounts from legacy opportunities.
WITH legacy_accounts AS (
  SELECT
    o."ownerId",
    COALESCE(NULLIF(trim(o."organization"), ''), s."name", 'Unknown account') AS name,
    MIN(o."workspace"::text)::"Workspace" AS workspace,
    MAX(NULLIF(o."country", '')) AS country,
    MAX(o."region") AS region,
    MAX(o."matchScore") AS fit_score,
    MIN(o."createdAt") AS created_at,
    CASE
      WHEN bool_or(o."ingestMethod" = 'COMMUNITY') THEN 'COMMUNITY'::"AccountType"
      WHEN bool_or(o."category" ILIKE '%tender%' OR s."type" = 'PROCUREMENT') THEN 'PUBLIC_BUYER'::"AccountType"
      WHEN bool_or(o."category" ILIKE '%startup%' OR o."category" ILIKE '%mvp%' OR o."description" ILIKE '%startup%') THEN 'STARTUP'::"AccountType"
      ELSE 'COMPANY'::"AccountType"
    END AS account_type,
    MAX(s."name") AS source_name
  FROM "Opportunity" o
  LEFT JOIN "Source" s ON s."id" = o."sourceId"
  GROUP BY o."ownerId", COALESCE(NULLIF(trim(o."organization"), ''), s."name", 'Unknown account')
)
INSERT INTO "Account" (
  "id", "ownerId", "name", "type", "workspace", "country", "region",
  "fitScore", "source", "createdAt", "updatedAt"
)
SELECT
  'acct_' || md5("ownerId" || ':' || name),
  "ownerId",
  name,
  account_type,
  workspace,
  country,
  region,
  fit_score,
  source_name,
  created_at,
  CURRENT_TIMESTAMP
FROM legacy_accounts
ON CONFLICT ("ownerId", "name") DO UPDATE SET
  "fitScore" = GREATEST(COALESCE("Account"."fitScore", 0), COALESCE(EXCLUDED."fitScore", 0)),
  "updatedAt" = CURRENT_TIMESTAMP;

-- Backfill Deals from legacy opportunities.
INSERT INTO "Deal" (
  "id", "ownerId", "accountId", "sourceId", "legacyOpportunityId", "title",
  "summary", "rawContent", "valueMin", "valueMax", "currency", "deadline",
  "status", "priority", "workspace", "category", "applicationRoute", "url",
  "matchScore", "confidenceScore", "pursuitScore", "qualification",
  "nextAction", "createdAt", "updatedAt"
)
SELECT
  'deal_' || md5(o."id"),
  o."ownerId",
  a."id",
  o."sourceId",
  o."id",
  o."title",
  COALESCE(o."aiSummary", o."description"),
  o."rawContent",
  o."budgetMin",
  o."budgetMax",
  o."currency",
  o."deadline",
  CASE o."status"
    WHEN 'NEW' THEN 'DISCOVERED'::"DealStatus"
    WHEN 'INTERESTING' THEN 'INTERESTING'::"DealStatus"
    WHEN 'WATCH' THEN 'INTERESTING'::"DealStatus"
    WHEN 'CONTACTED' THEN 'CONTACTED'::"DealStatus"
    WHEN 'APPLIED' THEN 'PROPOSAL'::"DealStatus"
    WHEN 'WON' THEN 'WON'::"DealStatus"
    WHEN 'LOST' THEN 'LOST'::"DealStatus"
    ELSE 'ARCHIVED'::"DealStatus"
  END,
  o."priority",
  o."workspace",
  o."category",
  o."applicationRoute",
  o."url",
  o."matchScore",
  CASE
    WHEN o."url" IS NOT NULL AND o."deadline" IS NOT NULL THEN 82
    WHEN o."url" IS NOT NULL OR o."deadline" IS NOT NULL THEN 68
    ELSE 48
  END,
  LEAST(100, COALESCE(o."matchScore", 50) + (o."priority" * 5)),
  jsonb_build_object(
    'legacyOpportunityId', o."id",
    'ingestMethod', o."ingestMethod",
    'scoreBreakdown', o."scoreBreakdown",
    'extractedRequirements', o."extractedRequirements"
  ),
  o."nextAction",
  o."createdAt",
  CURRENT_TIMESTAMP
FROM "Opportunity" o
LEFT JOIN "Source" s ON s."id" = o."sourceId"
LEFT JOIN "Account" a ON a."ownerId" = o."ownerId"
  AND a."name" = COALESCE(NULLIF(trim(o."organization"), ''), s."name", 'Unknown account')
ON CONFLICT ("legacyOpportunityId") DO NOTHING;

-- Backfill People and deal-person links from legacy contacts.
INSERT INTO "Person" (
  "id", "ownerId", "accountId", "name", "role", "email", "phone", "linkedin", "createdAt", "updatedAt"
)
SELECT
  'person_' || md5(c."id"),
  o."ownerId",
  d."accountId",
  c."name",
  c."role",
  c."email",
  c."phone",
  c."linkedin",
  c."createdAt",
  CURRENT_TIMESTAMP
FROM "Contact" c
JOIN "Opportunity" o ON o."id" = c."opportunityId"
JOIN "Deal" d ON d."legacyOpportunityId" = o."id"
WHERE c."name" IS NOT NULL OR c."email" IS NOT NULL
ON CONFLICT ("ownerId", "email") DO NOTHING;

INSERT INTO "DealPerson" ("dealId", "personId", "role", "createdAt")
SELECT
  d."id",
  p."id",
  c."role",
  CURRENT_TIMESTAMP
FROM "Contact" c
JOIN "Opportunity" o ON o."id" = c."opportunityId"
JOIN "Deal" d ON d."legacyOpportunityId" = o."id"
JOIN "Person" p ON p."id" = 'person_' || md5(c."id")
ON CONFLICT ("dealId", "personId") DO NOTHING;

-- Backfill evidence from source content.
INSERT INTO "Evidence" (
  "id", "ownerId", "dealId", "accountId", "kind", "url", "title", "snippet",
  "sourceName", "provider", "confidence", "metadata", "createdAt"
)
SELECT
  'ev_legacy_' || md5(o."id"),
  o."ownerId",
  d."id",
  d."accountId",
  CASE WHEN o."url" IS NOT NULL THEN 'WEB_RESULT'::"EvidenceKind" ELSE 'SOURCE_SNIPPET'::"EvidenceKind" END,
  o."url",
  o."title",
  LEFT(COALESCE(o."aiSummary", o."description", o."rawContent", o."title"), 2000),
  s."name",
  'legacy-opportunity',
  LEAST(95, GREATEST(35, COALESCE(o."matchScore", 50))),
  jsonb_build_object('sourceId', o."sourceId", 'dedupeHash', o."dedupeHash"),
  o."createdAt"
FROM "Opportunity" o
JOIN "Deal" d ON d."legacyOpportunityId" = o."id"
LEFT JOIN "Source" s ON s."id" = o."sourceId"
WHERE COALESCE(o."aiSummary", o."description", o."rawContent", o."title") IS NOT NULL;

-- Backfill notes as touchpoints.
INSERT INTO "Touchpoint" (
  "id", "ownerId", "accountId", "dealId", "kind", "occurredAt", "summary",
  "body", "createdAt", "updatedAt"
)
SELECT
  'tp_note_' || md5(n."id"),
  o."ownerId",
  d."accountId",
  d."id",
  'NOTE'::"TouchpointKind",
  n."createdAt",
  'Legacy note',
  n."body",
  n."createdAt",
  CURRENT_TIMESTAMP
FROM "Note" n
JOIN "Opportunity" o ON o."id" = n."opportunityId"
JOIN "Deal" d ON d."legacyOpportunityId" = o."id";

-- Backfill AI drafts as conversion assets.
INSERT INTO "ConversionAsset" (
  "id", "ownerId", "accountId", "dealId", "kind", "title", "content", "model",
  "promptSnapshot", "createdAt", "updatedAt"
)
SELECT
  'asset_' || md5(dr."id"),
  o."ownerId",
  d."accountId",
  d."id",
  CASE dr."kind"
    WHEN 'APPLICATION' THEN 'PROPOSAL'::"ConversionAssetKind"
    WHEN 'PITCH' THEN 'PITCH'::"ConversionAssetKind"
    WHEN 'EMAIL' THEN 'OUTREACH'::"ConversionAssetKind"
    WHEN 'CHECKLIST' THEN 'CHECKLIST'::"ConversionAssetKind"
    WHEN 'SUMMARY' THEN 'SUMMARY'::"ConversionAssetKind"
    ELSE 'SUMMARY'::"ConversionAssetKind"
  END,
  dr."title",
  dr."content",
  dr."model",
  dr."promptSnapshot",
  dr."createdAt",
  CURRENT_TIMESTAMP
FROM "Draft" dr
JOIN "Opportunity" o ON o."id" = dr."opportunityId"
JOIN "Deal" d ON d."legacyOpportunityId" = o."id";

-- Backfill concrete follow-up tasks from next actions and active deadlines.
INSERT INTO "Task" (
  "id", "ownerId", "accountId", "dealId", "title", "description", "dueAt",
  "status", "priority", "createdAt", "updatedAt"
)
SELECT
  'task_next_' || md5(o."id"),
  o."ownerId",
  d."accountId",
  d."id",
  COALESCE(NULLIF(o."nextAction", ''), 'Define next action'),
  'Backfilled from legacy opportunity next action.',
  CASE WHEN o."deadline" IS NOT NULL THEN o."deadline" - INTERVAL '3 days' ELSE NULL END,
  'OPEN'::"TaskStatus",
  CASE WHEN o."priority" >= 3 THEN 'URGENT'::"TaskPriority" WHEN o."priority" = 2 THEN 'HIGH'::"TaskPriority" ELSE 'MEDIUM'::"TaskPriority" END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Opportunity" o
JOIN "Deal" d ON d."legacyOpportunityId" = o."id"
WHERE o."status" NOT IN ('WON', 'LOST', 'ARCHIVED')
  AND (o."nextAction" IS NOT NULL OR o."deadline" IS NOT NULL);
