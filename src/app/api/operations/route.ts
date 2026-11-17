import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { discoveryProviderReadiness } from "@/lib/discovery";
import { hasLlm } from "@/lib/ai/provider";
import { usagePeriods } from "@/lib/jobs/usage";
export async function GET() {
  try {
    const user = await requireUser();
    const { day, month } = usagePeriods();
    const [worker, sources, daily, monthly, queued] = await Promise.all([
      db.workerHeartbeat.findFirst({ orderBy: { updatedAt: "desc" } }),
      db.source.findMany({ where: { ownerId: user.id, enabled: true }, select: { id: true, name: true, type: true, lastCheckedAt: true, discoveryRuns: { orderBy: { startedAt: "desc" }, take: 1 } } }),
      db.providerUsage.groupBy({ by: ["kind"], where: { ownerId: user.id, createdAt: { gte: day } }, _sum: { units: true, reservedUsd: true } }),
      db.providerUsage.groupBy({ by: ["kind"], where: { ownerId: user.id, createdAt: { gte: month } }, _sum: { units: true, reservedUsd: true } }),
      db.discoveryMission.findFirst({ where: { ownerId: user.id, status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);
    const conversion = await db.$queryRaw<Array<{ source: string; candidates: number; accepted: number; won: number; lost: number; contacted: number; proposals: number; meanDaysToWin: number | null }>>`
      SELECT COALESCE(c."sourceName", 'Unknown source') AS source,
        COUNT(DISTINCT c.id)::int AS candidates,
        COUNT(DISTINCT c."dealId")::int AS accepted,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'WON')::int AS won,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'LOST')::int AS lost,
        COUNT(DISTINCT d.id) FILTER (WHERE EXISTS (SELECT 1 FROM "Touchpoint" t WHERE t."dealId" = d.id AND t."ownerId" = ${user.id}))::int AS contacted,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('PROPOSAL', 'NEGOTIATION', 'WON'))::int AS proposals,
        AVG(EXTRACT(EPOCH FROM (d."closedAt" - d."createdAt")) / 86400) FILTER (WHERE d.status = 'WON' AND d."closedAt" IS NOT NULL)::float8 AS "meanDaysToWin"
      FROM "DiscoveryCandidate" c LEFT JOIN "Deal" d ON d.id = c."dealId" AND d."ownerId" = ${user.id}
      WHERE c."ownerId" = ${user.id} GROUP BY c."sourceName" ORDER BY COUNT(DISTINCT c."dealId") DESC LIMIT 30`;
    return NextResponse.json({
      worker: { ready: Boolean(worker && Date.now() - worker.updatedAt.getTime() < 60_000), lastHeartbeat: worker?.updatedAt },
      search: discoveryProviderReadiness(user.aiKeys), ai: hasLlm(user.aiKeys),
      oldestQueuedAt: queued?.createdAt, sources, conversion, usage: { daily, monthly },
    });
  } catch (error) { return apiError(error); }
}
