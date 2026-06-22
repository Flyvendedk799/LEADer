-- Persist queued lane-discovery inputs so background missions can be recovered after a restart.
ALTER TABLE "DiscoveryMission" ADD COLUMN "input" JSONB;
