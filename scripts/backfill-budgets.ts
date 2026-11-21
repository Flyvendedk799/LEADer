// Re-derive budgets for existing candidates with the current extraction rules.
//   npm run budgets:backfill            # dry run: prints what would change
//   npm run budgets:backfill -- --apply # writes the changes
// Sources, in order: the official udbud.dk estimate; the source page (structured
// data, main content, header/sidebar boxes); the stored text. A value that none
// of them supports is cleared. Linked deals without a value get the new one.
import "dotenv/config";
import { db } from "../src/lib/db";
import { fetchReadablePage, udbudDkNoticeValue } from "../src/lib/discovery";
import { extractBudget } from "../src/lib/ingestion/extract";

const apply = process.argv.includes("--apply");
const statuses = ["NEW", "REVIEWED", "SAVED"] as const;

type Found = { min?: number; max?: number; currency?: string; source: string };

async function derive(c: { url: string | null; title: string; rawContent: string | null; description: string | null }): Promise<Found> {
  const notice = c.url?.match(/udbud\.dk\/detaljevisning\?.*noticeId=([0-9a-f-]+)/i)?.[1];
  if (notice) {
    const publication = c.url?.match(/noticePublicationNumber=([\d-]+)/i)?.[1];
    const official = await udbudDkNoticeValue(notice, c.title, publication).catch(() => null);
    if (official) return { max: official.value, currency: official.currency, source: official.source };
  }
  if (c.url && !notice) {
    const page = await fetchReadablePage(c.url).catch(() => null);
    if (page?.budget?.max) return { ...page.budget, source: `page (${page.budget.source})` };
  }
  const text = [c.title, c.description, c.rawContent].filter(Boolean).join("\n");
  const fromText = extractBudget(text);
  return fromText.max ? { min: fromText.min, max: fromText.max, currency: fromText.currency, source: "stored text" } : { source: "none" };
}

async function main() {
  const rows = await db.discoveryCandidate.findMany({
    where: { status: { in: [...statuses] } },
    select: { id: true, title: true, url: true, rawContent: true, description: true, budgetMin: true, budgetMax: true, currency: true, dealId: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  let changed = 0;
  for (const row of rows) {
    const found = await derive(row);
    const next = { budgetMin: found.min ?? null, budgetMax: found.max ?? null, currency: found.currency ?? row.currency ?? "DKK" };
    const same = next.budgetMin === row.budgetMin && next.budgetMax === row.budgetMax && (next.budgetMax == null || next.currency === row.currency);
    if (same) continue;
    changed++;
    const fmt = (min: number | null, max: number | null, cur: string | null) => (max == null ? "—" : `${min != null ? `${min.toLocaleString("da-DK")}–` : ""}${max.toLocaleString("da-DK")} ${cur ?? ""}`);
    console.log(`${row.status.padEnd(8)} ${fmt(row.budgetMin, row.budgetMax, row.currency).padStart(22)} → ${fmt(next.budgetMin, next.budgetMax, next.currency).padEnd(24)} [${found.source}] ${row.title.slice(0, 70)}`);
    if (!apply) continue;
    await db.discoveryCandidate.update({ where: { id: row.id }, data: next });
    if (row.dealId && next.budgetMax != null) {
      await db.deal.updateMany({
        where: { id: row.dealId, valueMax: null, valueMin: null },
        data: { valueMin: next.budgetMin, valueMax: next.budgetMax, currency: next.currency },
      });
    }
  }
  console.log(`${rows.length} candidates checked, ${changed} ${apply ? "updated" : "would change (dry run; pass --apply)"}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
