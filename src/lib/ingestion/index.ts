import { db } from "@/lib/db";
import { scoreOpportunity } from "@/lib/scoring";
import { embed, opportunityEmbedText } from "@/lib/ai/embeddings";
import type { ScoreWeights, SourceType } from "@/lib/types";
import { assertAutomatable } from "./compliance";
import { type OpportunityCandidate, dedupeHash } from "./dedupe";
import { fetchRssCandidates } from "./rss";
import { fetchWebCandidates } from "./web";
import { detectApplicationRoute, extractBudget, extractDeadline } from "./extract";

// ─────────────────────────────────────────────────────────────────────────
// Discovery orchestrator. For a given (automatable) Source: fetch → normalise
// → enrich (budget/deadline/route) → dedupe → score → upsert → audit run.
//
// Community/manual source types are rejected by assertAutomatable() — they go
// through the manual import lane (/api/import/community) instead.
// ─────────────────────────────────────────────────────────────────────────

export interface RunResult {
  sourceId: string;
  status: "SUCCESS" | "ERROR" | "SKIPPED";
  found: number;
  created: number;
  updated: number;
  error?: string;
}

type SourceRow = {
  id: string;
  ownerId: string;
  type: string;
  url: string | null;
  keywords: string[];
  parserKey: string | null;
  workspace: string;
  country: string | null;
  region: string | null;
  category: string | null;
};

function enrich(c: OpportunityCandidate): OpportunityCandidate {
  const text = `${c.title}\n${c.description || ""}\n${c.rawContent || ""}`;
  const budget = c.budgetMax == null && c.budgetMin == null ? extractBudget(text) : {};
  return {
    ...c,
    budgetMin: c.budgetMin ?? budget.min,
    budgetMax: c.budgetMax ?? budget.max,
    currency: c.currency ?? budget.currency ?? "DKK",
    deadline: c.deadline ?? extractDeadline(text),
    applicationRoute:
      c.applicationRoute && c.applicationRoute !== "UNKNOWN"
        ? c.applicationRoute
        : detectApplicationRoute(text),
  };
}

async function fetchCandidates(source: SourceRow): Promise<OpportunityCandidate[]> {
  if (!source.url) return [];
  switch (source.type) {
    case "RSS":
    case "NEWSLETTER":
      return fetchRssCandidates(source.url, source.keywords);
    case "PUBLIC_WEB":
    case "PROCUREMENT":
    case "ACCELERATOR":
    case "API":
      return fetchWebCandidates(source.url, {
        keywords: source.keywords,
        parserKey: source.parserKey,
      });
    default:
      return [];
  }
}

/** Run discovery for one source and persist results. */
export async function runDiscoveryForSource(sourceId: string): Promise<RunResult> {
  const source = (await db.source.findUnique({ where: { id: sourceId } })) as SourceRow | null;
  if (!source) return { sourceId, status: "ERROR", found: 0, created: 0, updated: 0, error: "not found" };

  // Compliance gate.
  try {
    assertAutomatable(source.type as SourceType);
  } catch (e) {
    return { sourceId, status: "SKIPPED", found: 0, created: 0, updated: 0, error: (e as Error).message };
  }

  const run = await db.discoveryRun.create({
    data: { sourceId, status: "RUNNING" },
  });

  const owner = await db.user.findUnique({ where: { id: source.ownerId } });
  const weights = (owner?.scoringWeights as Partial<ScoreWeights>) || undefined;
  const budgetMaxDkk = owner?.budgetMaxDkk ?? 100000;

  let created = 0;
  let updated = 0;
  let candidates: OpportunityCandidate[] = [];

  try {
    candidates = (await fetchCandidates(source)).map(enrich);

    for (const c of candidates) {
      const hash = dedupeHash(c);
      const breakdown = scoreOpportunity(
        { ...c, contacts: c.contacts },
        { budgetMaxDkk, weights },
      );
      breakdown.computedAt = new Date().toISOString();
      const isActive = !c.deadline || new Date(c.deadline).getTime() >= Date.now();

      const existing = await db.opportunity.findUnique({ where: { dedupeHash: hash } });
      if (existing) {
        await db.opportunity.update({
          where: { id: existing.id },
          data: {
            // Refresh derived fields; never overwrite user status/notes.
            isActive,
            matchScore: breakdown.total,
            scoreBreakdown: breakdown as object,
            deadline: c.deadline ?? existing.deadline,
            budgetMin: c.budgetMin ?? existing.budgetMin,
            budgetMax: c.budgetMax ?? existing.budgetMax,
          },
        });
        updated++;
      } else {
        const opp = await db.opportunity.create({
          data: {
            ownerId: source.ownerId,
            sourceId: source.id,
            title: c.title,
            description: c.description,
            rawContent: c.rawContent,
            url: c.url,
            organization: c.organization,
            location: c.location,
            country: c.country ?? source.country ?? "DK",
            region: c.region ?? source.region,
            category: c.category ?? source.category,
            workspace: (source.workspace as "DK" | "GLOBAL") ?? "DK",
            budgetMin: c.budgetMin,
            budgetMax: c.budgetMax,
            currency: c.currency ?? "DKK",
            deadline: c.deadline ?? undefined,
            postedAt: c.postedAt ?? undefined,
            isActive,
            applicationRoute: c.applicationRoute ?? "UNKNOWN",
            ingestMethod: "AUTOMATED",
            matchScore: breakdown.total,
            scoreBreakdown: breakdown as object,
            dedupeHash: hash,
            status: "NEW",
            contacts: c.contacts?.length
              ? { create: c.contacts.map((ct) => ({ name: ct.name, email: ct.email, role: ct.role })) }
              : undefined,
            attachments: c.attachments?.length
              ? { create: c.attachments.map((a) => ({ url: a.url, label: a.label, kind: a.kind })) }
              : undefined,
            activities: { create: { type: "IMPORT", message: "Discovered via automated source" } },
          },
        });
        created++;
        // Embed for semantic similarity (best-effort; never fail the run).
        try {
          const { vector, model } = await embed(opportunityEmbedText(opp));
          await db.opportunity.update({
            where: { id: opp.id },
            data: { embedding: vector, embeddingModel: model, embeddedAt: new Date() },
          });
        } catch {
          /* embedding is non-critical; backfill later */
        }
        // High-match alert.
        if (breakdown.total >= 80) {
          await db.alert.create({
            data: {
              ownerId: source.ownerId,
              type: "NEW_HIGH_MATCH",
              title: `New high-match lead: ${opp.title}`,
              body: `Score ${breakdown.total}. ${c.url ?? ""}`,
              payload: { opportunityId: opp.id, score: breakdown.total },
            },
          });
        }
      }
    }

    await db.source.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date() } });
    await db.discoveryRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        foundCount: candidates.length,
        newCount: created,
        updatedCount: updated,
        log: `Found ${candidates.length}, created ${created}, updated ${updated}.`,
      },
    });

    return { sourceId, status: "SUCCESS", found: candidates.length, created, updated };
  } catch (e) {
    const error = (e as Error).message;
    await db.discoveryRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: new Date(), log: error, foundCount: candidates.length },
    });
    return { sourceId, status: "ERROR", found: candidates.length, created, updated, error };
  }
}

// Source types the scheduler is allowed to fetch (mirrors the compliance gate).
const AUTOMATABLE = ["RSS", "NEWSLETTER", "PUBLIC_WEB", "PROCUREMENT", "ACCELERATOR", "API"];

/** Is this source due to run, given its frequency and last-checked time? */
export function isSourceDue(
  source: { frequency: string; lastCheckedAt: Date | null },
  now = new Date(),
): boolean {
  if (source.frequency === "MANUAL") return false;
  if (!source.lastCheckedAt) return true;
  const elapsed = now.getTime() - source.lastCheckedAt.getTime();
  const intervals: Record<string, number> = {
    HOURLY: 60 * 60 * 1000,
    DAILY: 24 * 60 * 60 * 1000,
    WEEKLY: 7 * 24 * 60 * 60 * 1000,
  };
  const interval = intervals[source.frequency];
  return interval == null ? true : elapsed >= interval;
}

/** Run discovery for all enabled, automatable, due sources of a given owner. */
export async function runDueDiscovery(ownerId: string): Promise<RunResult[]> {
  const sources = await db.source.findMany({ where: { ownerId, enabled: true } });
  const results: RunResult[] = [];
  for (const s of sources) {
    if (!AUTOMATABLE.includes(s.type)) continue; // skip community/manual up front
    if (!isSourceDue(s)) continue; // respect each source's frequency
    results.push(await runDiscoveryForSource(s.id));
  }
  return results;
}

/** Run due discovery across every owner — the multi-tenant scheduler entrypoint. */
export async function runDueDiscoveryAllOwners(): Promise<Record<string, RunResult[]>> {
  const owners = await db.user.findMany({ select: { id: true } });
  const byOwner: Record<string, RunResult[]> = {};
  for (const o of owners) {
    const results = await runDueDiscovery(o.id);
    if (results.length) byOwner[o.id] = results;
  }
  return byOwner;
}

export { type OpportunityCandidate, dedupeHash };
