import { db } from "@/lib/db";
import { companyProfile } from "@/lib/company-profile";

export function usagePeriods(now = new Date()) {
  return { day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
}
/** Reserve before calling a provider. Failed requests still consume allowance because providers can bill them. */
export async function reserveUsage(ownerId: string, kind: "SEARCH" | "AI", units = 1) {
  if (!Number.isInteger(units) || units < 1) throw new Error("Invalid usage reservation");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`usage:${ownerId}`}))`;
    const owner = await tx.user.findUniqueOrThrow({ where: { id: ownerId }, select: { companyProfile: true } });
    const profile = companyProfile(owner.companyProfile);
    const daily = kind === "SEARCH" ? profile.dailySearchQueries : profile.dailyAiCalls;
    const monthly = kind === "SEARCH" ? profile.monthlySearchQueries : profile.monthlyAiCalls;
    if (!daily || !monthly) throw new Error(`Paid ${kind.toLowerCase()} paused: set daily and monthly allowances in Settings → Company.`);
    const { day, month } = usagePeriods();
    const reservedUsd = Math.ceil(units * (kind === "SEARCH" ? profile.searchQueryReserveUsd : profile.aiCallReserveUsd) * 1e6) / 1e6;
    if (!profile.dailyBudgetUsd || !profile.monthlyBudgetUsd) throw new Error("Paid services paused: configure daily and monthly reserved-spend budgets in Settings.");
    const spent = async (since: Date) => {
      const [row] = await tx.$queryRaw<Array<{ total: number }>>`SELECT COALESCE(SUM(GREATEST("reservedUsd", COALESCE("actualUsd", 0))), 0)::float8 AS total FROM "ProviderUsage" WHERE "ownerId" = ${ownerId} AND "createdAt" >= ${since}`;
      return row.total;
    };
    if (await spent(day) + reservedUsd > profile.dailyBudgetUsd || await spent(month) + reservedUsd > profile.monthlyBudgetUsd) throw new Error("Reserved-spend budget reached; paid services paused.");
    const total = async (since: Date) => (await tx.providerUsage.aggregate({ where: { ownerId, kind, createdAt: { gte: since } }, _sum: { units: true } }))._sum.units ?? 0;
    if (await total(day) + units > daily || await total(month) + units > monthly) throw new Error(`${kind} allowance reached. Public-source scanning remains available.`);
    return tx.providerUsage.create({ data: { ownerId, kind, units, reservedUsd } });
  });
}

/** Token counts come from provider responses. Invoice cost stays unknown until explicitly reconciled. */
export async function finishUsage(id: string, data: { provider?: string; model?: string; status: "SUCCEEDED" | "FAILED"; inputTokens?: number; outputTokens?: number }) {
  const token = (n?: number) => Number.isSafeInteger(n) && n! >= 0 && n! <= 2147483647 ? n : undefined;
  return db.providerUsage.update({ where: { id }, data: { ...data, inputTokens: token(data.inputTokens), outputTokens: token(data.outputTokens) } });
}
