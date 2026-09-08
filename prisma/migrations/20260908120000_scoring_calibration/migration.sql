-- Cached outcome-learning model: what an owner's own won/lost/archived
-- decisions imply about how leads should be ranked.
--
-- Pure derived data. It is recomputed from Opportunity rows on demand, so
-- dropping this table costs a rebuild and nothing else; the application also
-- degrades to the uncalibrated heuristic when the table is absent.
CREATE TABLE "ScoringCalibration" (
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "sampleCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringCalibration_pkey" PRIMARY KEY ("ownerId")
);

ALTER TABLE "ScoringCalibration"
ADD CONSTRAINT "ScoringCalibration_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
