import { db } from "@/lib/db";
import { fetchReadablePage } from "@/lib/discovery";
import { extractExplicitDeadline } from "@/lib/ingestion/extract";
import type { Workspace } from "@/lib/types";

/** Refresh source evidence without overwriting the owner's commercial decisions. */
export async function refreshDealEvidence(ownerId: string, workspace: Workspace, isCanceled?: () => Promise<boolean>) {
  const day = new Date().toISOString().slice(0, 10);
  const targets = await db.$queryRaw<Array<{ id: string }>>`
    SELECT d.id FROM "Deal" d LEFT JOIN "Evidence" e ON e."dealId" = d.id AND e.title = 'Source recheck'
    WHERE d."ownerId" = ${ownerId} AND d.workspace::text = ${workspace} AND d.url IS NOT NULL
      AND d.status IN ('DISCOVERED', 'QUALIFYING', 'INTERESTING', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION')
    GROUP BY d.id HAVING MAX(e."createdAt") IS NULL OR MAX(e."createdAt") < NOW() - INTERVAL '24 hours'
    ORDER BY MAX(e."createdAt") ASC NULLS FIRST, d."createdAt" ASC LIMIT 10`;
  const deals = await db.deal.findMany({ where: { ownerId, id: { in: targets.map(row => row.id) } } });
  let checked = 0, changed = 0, failed = 0;
  for (const deal of deals) {
    if (await isCanceled?.()) break;
    const id = `recheck:${deal.id}:${day}`;
    if (await db.evidence.findUnique({ where: { id } })) continue;
    const page = await fetchReadablePage(deal.url!);
    if (await isCanceled?.()) break;
    const deadline = page.text ? extractExplicitDeadline(page.text) : null;
    const deadlineChanged = Boolean(deadline && deal.deadline && Math.abs(deadline.getTime() - deal.deadline.getTime()) > 60_000);
    const expired = Boolean(deadline && deadline.getTime() < Date.now());
    const unreadable = page.provenance?.status !== "read";
    await db.$transaction(async tx => {
      await tx.evidence.upsert({ where: { id }, update: {}, create: {
        id, ownerId, dealId: deal.id, accountId: deal.accountId, kind: "WEB_RESULT", url: deal.url,
        title: "Source recheck", snippet: (page.text || page.provenance?.reason || "Source could not be verified").slice(0, 2000),
        metadata: { provenance: page.provenance, observedDeadline: deadline?.toISOString() ?? null, deadlineChanged, expired },
      } });
      if (deadlineChanged || expired || unreadable) {
        const taskId = `source-change:${deal.id}:${day}`;
        await tx.task.upsert({ where: { id: taskId }, update: {}, create: { id: taskId, ownerId, dealId: deal.id, accountId: deal.accountId,
          title: unreadable ? "Recheck unavailable opportunity source" : "Verify changed or expired source deadline",
          description: `Source: ${deal.url}. ${deadline ? `Observed deadline: ${deadline.toISOString()}.` : page.provenance?.reason ?? ""} Original deal fields were preserved.`, dueAt: new Date(), priority: "HIGH" } });
      }
    });
    checked++; if (deadlineChanged || expired) changed++; if (unreadable) failed++;
  }
  return { checked, changed, failed };
}
