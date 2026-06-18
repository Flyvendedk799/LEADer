-- Add first-run onboarding state. Existing users are considered onboarded so
-- deployments do not unexpectedly lock established accounts into setup.
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

UPDATE "User"
SET "onboardedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "onboardedAt" IS NULL;
