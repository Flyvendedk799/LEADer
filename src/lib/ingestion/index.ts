import { db } from "@/lib/db";
import { scoreOpportunity } from "@/lib/scoring";
import { loadCalibration, recomputeCalibration } from "@/lib/scoring/outcomes";
import { persistCandidate } from "@/lib/crm";
import { ensureDefaultDiscoveryLanes, laneCandidateGate } from "@/lib/crm/lanes";
import type { ScoreWeights, SourceType } from "@/lib/types";
import { assertAutomatable, isAllowedByRobots } from "./compliance";
import { type OpportunityCandidate, dedupeHash } from "./dedupe";
import { fetchRssCandidates } from "./rss";
import { fetchWebCandidates } from "./web";
import {
  detectApplicationRoute,
  extractBudget,
  extractExplicitDeadline,
} from "./extract";

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
  name: string;
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
  const budget =
    c.budgetMax == null && c.budgetMin == null ? extractBudget(text) : {};
  return {
    ...c,
    budgetMin: c.budgetMin ?? budget.min,
    budgetMax: c.budgetMax ?? budget.max,
    currency: c.currency ?? budget.currency ?? "DKK",
    deadline: c.deadline ?? extractExplicitDeadline(text),
    applicationRoute:
      c.applicationRoute && c.applicationRoute !== "UNKNOWN"
        ? c.applicationRoute
        : detectApplicationRoute(text),
  };
}

async function fetchCandidates(
  source: SourceRow,
): Promise<OpportunityCandidate[]> {
  if (!source.url) return [];
  switch (source.type) {
    case "RSS":
    case "NEWSLETTER":
      return fetchRssCandidates(source.url, source.keywords);
    case "PUBLIC_WEB":
    case "PROCUREMENT":
    case "ACCELERATOR":
      return fetchWebCandidates(source.url, {
        keywords: source.keywords,
        parserKey: source.parserKey,
      });
    case "API":
      throw new Error("No API adapter is configured for this source.");
    default:
      return [];
  }
}

/** Run discovery for one source and persist results. */
export async function runDiscoveryForSource(
  sourceId: string,
): Promise<RunResult> {
  const source = (await db.source.findUnique({
    where: { id: sourceId },
  })) as SourceRow | null;
  if (!source)
    return {
      sourceId,
      status: "ERROR",
      found: 0,
      created: 0,
      updated: 0,
      error: "not found",
    };

  // Compliance gate.
  try {
    assertAutomatable(source.type as SourceType);
  } catch (e) {
    return {
      sourceId,
      status: "SKIPPED",
      found: 0,
      created: 0,
      updated: 0,
      error: (e as Error).message,
    };
  }

  const run = await db.discoveryRun.create({
    data: { sourceId, status: "RUNNING" },
  });

  const owner = await db.user.findUnique({ where: { id: source.ownerId } });
  const weights = (owner?.scoringWeights as Partial<ScoreWeights>) || undefined;
  const budgetMaxDkk = owner?.budgetMaxDkk ?? 0;
  // Rank newly ingested leads through what this owner has actually won.
  const calibration = await loadCalibration(source.ownerId);

  let created = 0;
  let updated = 0;
  let candidates: OpportunityCandidate[] = [];

  try {
    if (source.url) {
      const allowed = await isAllowedByRobots(source.url).catch(() => null);
      if (allowed != null) {
        await db.source.update({
          where: { id: source.id },
          data: { robotsAllowed: allowed },
        });
      }
      if (allowed === false)
        throw new Error(`Blocked by robots.txt: ${source.url}`);
    }

    candidates = (await fetchCandidates(source)).map(enrich);

    await ensureDefaultDiscoveryLanes(source.ownerId);
    const lane = await db.discoveryLane.findUniqueOrThrow({
      where: { ownerId_slug: { ownerId: source.ownerId, slug: ["dba-assignments", "need-assignments"].includes(source.parserKey ?? "") ? "freelance-contracts" : source.type === "PROCUREMENT" ? "tenders-procurement" : "client-projects" } },
    });
    for (const c of candidates) {
      if (c.deadline && c.deadline.getTime() < Date.now()) continue;
      if (!laneCandidateGate(lane, c).allowed) continue;
      const breakdown = scoreOpportunity(c, { budgetMaxDkk, weights, calibration });
      const saved = await persistCandidate(source.ownerId, null, lane, {
        ...c,
        id: dedupeHash(c), candidateKind: "opportunity", freshness: c.deadline ? "active" : "unknown",
        deadline: c.deadline?.toISOString(), postedAt: c.postedAt?.toISOString(),
        sourceName: source.name, sourceKind: "source-scan", provider: "public-source", query: source.keywords.join(" "),
        matchScore: breakdown.total, scoreBreakdown: breakdown, reasons: [], signals: [],
        applicationRoute: c.applicationRoute ?? "UNKNOWN", contacts: c.contacts ?? [], attachments: c.attachments ?? [],
      }, source.workspace === "GLOBAL" ? "GLOBAL" : "DK");
      if (saved.ingestedNew) created++; else updated++;
    }

    await db.source.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date() },
    });
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

    return {
      sourceId,
      status: "SUCCESS",
      found: candidates.length,
      created,
      updated,
    };
  } catch (e) {
    const error = (e as Error).message;
    await db.discoveryRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        log: error,
        foundCount: candidates.length,
      },
    });
    return {
      sourceId,
      status: "ERROR",
      found: candidates.length,
      created,
      updated,
      error,
    };
  }
}

// Source types the scheduler is allowed to fetch (mirrors the compliance gate).
const AUTOMATABLE = [
  "RSS",
  "NEWSLETTER",
  "PUBLIC_WEB",
  "PROCUREMENT",
  "ACCELERATOR",
  "API",
];

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
  const sources = await db.source.findMany({
    where: { ownerId, enabled: true },
  });

  // Relearn first so tonight's leads are ranked by everything decided today.
  // Never let a calibration failure block ingestion — ranking degrades to the
  // last good model, or to the plain heuristic.
  if (sources.length) {
    try {
      await recomputeCalibration(ownerId);
    } catch {
      // non-fatal by design
    }
  }

  const results: RunResult[] = [];
  for (const s of sources) {
    if (!AUTOMATABLE.includes(s.type)) continue; // skip community/manual up front
    if (!isSourceDue(s)) continue; // respect each source's frequency
    results.push(await runDiscoveryForSource(s.id));
  }
  return results;
}

/** Run due discovery across every owner — the multi-tenant scheduler entrypoint. */
export async function runDueDiscoveryAllOwners(): Promise<
  Record<string, RunResult[]>
> {
  const owners = await db.user.findMany({ select: { id: true } });
  const byOwner: Record<string, RunResult[]> = {};
  for (const o of owners) {
    const results = await runDueDiscovery(o.id);
    if (results.length) byOwner[o.id] = results;
  }
  return byOwner;
}

export { type OpportunityCandidate, dedupeHash };
