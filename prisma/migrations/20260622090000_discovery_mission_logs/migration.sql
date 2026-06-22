-- Add durable phase logs for queued lane discovery missions.
ALTER TABLE "DiscoveryMission" ADD COLUMN "log" TEXT[] DEFAULT ARRAY[]::TEXT[];
