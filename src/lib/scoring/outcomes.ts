/**
 * The outcome loop's data layer: read decided opportunities, learn from them,
 * cache the result.
 *
 * The training set is derived from decided Opportunity rows plus Deal wins and
 * losses that are not already represented by those opportunities. That is
 * deliberate — learning works retroactively, needs no hook on the status write
 * path, and a wiped cache costs only a recompute.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type {
  OpportunityStatus,
  OutcomeSample,
  ScoreBreakdown,
  ScoreCriterion,
  ScoreWeights,
  ScoringCalibrationModel,
} from "@/lib/types";
import { buildCalibration, CALIBRATION_VERSION, OUTCOME_LABELS } from "./calibration";
import { opportunityFeatures } from "./features";
import { rawSignals } from ".";

/** Cap the training window so one very old pipeline can't dominate forever. */
const MAX_TRAINING_ROWS = 2000;

type OpportunityRow = Prisma.OpportunityGetPayload<{
  include: { contacts: true; source: { select: { name: true } } };
}>;

/**
 * Prisma raises P2021 when the table has not been pushed yet. The calibration
 * table is pure derived data, so a deployment that has not migrated should lose
 * the feature quietly rather than break scoring.
 */
function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return record.code === "P2021" || /ScoringCalibration.*does not exist/i.test(message);
}

async function withOptionalTable<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isMissingTable(error)) return fallback;
    throw error;
  }
}

/**
 * Recover the per-criterion raw signals for a decided opportunity.
 *
 * The stored breakdown is preferred because it is a genuine snapshot from when
 * the lead was scored — recomputing today would mark every historical deadline
 * "expired" and destroy the time-sensitivity signal. Recomputation is only the
 * fallback for rows scored before breakdowns were persisted.
 */
export function recoverRawSignals(
  row: OpportunityRow,
  budgetMaxDkk: number,
): Partial<Record<ScoreCriterion, number>> {
  const stored = row.scoreBreakdown as ScoreBreakdown | null;
  if (stored && Array.isArray(stored.components) && stored.components.length) {
    const out: Partial<Record<ScoreCriterion, number>> = {};
    for (const component of stored.components) {
      if (component && typeof component.raw === "number" && Number.isFinite(component.raw)) {
        out[component.criterion] = component.raw;
      }
    }
    if (Object.keys(out).length) return out;
  }

  return rawSignals(
    {
      title: row.title,
      description: row.description,
      rawContent: row.rawContent,
      budgetMin: row.budgetMin,
      budgetMax: row.budgetMax,
      deadline: row.deadline,
      organization: row.organization,
      category: row.category,
      applicationRoute: row.applicationRoute,
      contacts: row.contacts,
    },
    { budgetMaxDkk },
  );
}

/** Turn one decided opportunity into a labelled training row. */
export function toOutcomeSample(
  row: OpportunityRow,
  budgetMaxDkk: number,
): OutcomeSample | null {
  const label = OUTCOME_LABELS[row.status as OpportunityStatus];
  if (!label) return null; // NEW — never triaged, carries no signal

  return {
    id: row.id,
    status: row.status as OpportunityStatus,
    label,
    raws: recoverRawSignals(row, budgetMaxDkk),
    features: opportunityFeatures({
      title: row.title,
      description: row.description,
      organization: row.organization,
      category: row.category,
      applicationRoute: row.applicationRoute,
      workspace: row.workspace,
      budgetMin: row.budgetMin,
      budgetMax: row.budgetMax,
      source: row.source,
    }),
    decidedAt: row.updatedAt?.toISOString(),
  };
}

/** Every triaged opportunity for an owner, as labelled training rows. */
export async function collectOutcomeSamples(ownerId: string): Promise<OutcomeSample[]> {
  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: { budgetMaxDkk: true },
  });
  const budgetMaxDkk = user?.budgetMaxDkk ?? 100000;

  const rows = await db.opportunity.findMany({
    where: { ownerId, status: { not: "NEW" } },
    include: { contacts: true, source: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: MAX_TRAINING_ROWS,
  });

  const samples: OutcomeSample[] = [];
  for (const row of rows) {
    const sample = toOutcomeSample(row, budgetMaxDkk);
    if (sample) samples.push(sample);
  }

  const sampledOpportunityIds = new Set(rows.map((row) => row.id));
  const deals = await db.deal.findMany({
    where: { ownerId, status: { in: ["WON", "LOST"] } },
    include: {
      account: { select: { name: true } },
      source: { select: { name: true } },
      legacyOpportunity: { include: { contacts: true, source: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_TRAINING_ROWS,
  });
  for (const deal of deals) {
    if (deal.legacyOpportunityId && sampledOpportunityIds.has(deal.legacyOpportunityId)) continue;
    const sample = dealToOutcomeSample(deal, budgetMaxDkk);
    if (sample) samples.push(sample);
  }
  return samples;
}

/** A won or lost deal, shaped like an opportunity sample. Skips every other status. */
export function dealToOutcomeSample(
  deal: {
    id: string;
    status: string;
    title: string;
    summary?: string | null;
    rawContent?: string | null;
    valueMin?: number | null;
    valueMax?: number | null;
    deadline?: Date | null;
    category?: string | null;
    applicationRoute?: string | null;
    workspace?: string | null;
    updatedAt?: Date | null;
    account?: { name: string } | null;
    source?: { name: string } | null;
    legacyOpportunity?: {
      scoreBreakdown?: unknown;
      contacts?: OpportunityRow["contacts"];
      source?: { name: string } | null;
    } | null;
  },
  budgetMaxDkk: number,
): OutcomeSample | null {
  if (deal.status !== "WON" && deal.status !== "LOST") return null;
  return toOutcomeSample(
    {
      id: deal.id,
      status: deal.status,
      title: deal.title,
      description: deal.summary ?? null,
      rawContent: deal.rawContent ?? null,
      budgetMin: deal.valueMin ?? null,
      budgetMax: deal.valueMax ?? null,
      deadline: deal.deadline ?? null,
      organization: deal.account?.name ?? null,
      category: deal.category ?? null,
      applicationRoute: deal.applicationRoute ?? "UNKNOWN",
      workspace: deal.workspace ?? "DK",
      contacts: deal.legacyOpportunity?.contacts ?? [],
      source: deal.source ?? deal.legacyOpportunity?.source ?? null,
      scoreBreakdown: deal.legacyOpportunity?.scoreBreakdown ?? null,
      updatedAt: deal.updatedAt ?? null,
    } as OpportunityRow,
    budgetMaxDkk,
  );
}

/** Learn a fresh model from the owner's outcomes and cache it. */
export async function recomputeCalibration(ownerId: string): Promise<ScoringCalibrationModel> {
  const [user, samples] = await Promise.all([
    db.user.findUnique({ where: { id: ownerId }, select: { scoringWeights: true } }),
    collectOutcomeSamples(ownerId),
  ]);

  const baseWeights = (user?.scoringWeights as Partial<ScoreWeights>) || {};
  const model = buildCalibration(samples, baseWeights);

  await withOptionalTable(
    () =>
      db.scoringCalibration.upsert({
        where: { ownerId },
        create: {
          ownerId,
          version: model.version,
          payload: model as object,
          sampleCount: model.sampleCount,
          confidence: model.confidence,
          computedAt: new Date(model.computedAt),
        },
        update: {
          version: model.version,
          payload: model as object,
          sampleCount: model.sampleCount,
          confidence: model.confidence,
          computedAt: new Date(model.computedAt),
        },
      }),
    null,
  );

  return model;
}

/**
 * The cached model for scoring. Returns null when there is nothing usable — the
 * scorer then behaves exactly as it did before outcome learning existed.
 */
export async function loadCalibration(
  ownerId: string,
): Promise<ScoringCalibrationModel | null> {
  const row = await withOptionalTable(
    () => db.scoringCalibration.findUnique({ where: { ownerId } }),
    null,
  );
  if (!row) return null;

  const model = row.payload as ScoringCalibrationModel | null;
  if (!model || typeof model !== "object") return null;
  // A model from an older learner may not mean the same thing — ignore it and
  // let the next recompute replace it.
  if (model.version !== CALIBRATION_VERSION) return null;
  if (model.insufficientData || !model.confidence) return null;
  return model;
}

/**
 * The model plus, when it is missing or stale, a freshly learned one.
 * Used by the calibration UI so the first visit is never empty.
 */
export async function loadOrComputeCalibration(
  ownerId: string,
): Promise<ScoringCalibrationModel> {
  const row = await withOptionalTable(
    () => db.scoringCalibration.findUnique({ where: { ownerId } }),
    null,
  );
  const cached = row?.payload as ScoringCalibrationModel | null;
  if (cached && typeof cached === "object" && cached.version === CALIBRATION_VERSION) {
    return cached;
  }
  return recomputeCalibration(ownerId);
}
