/**
 * Manual discovery runner — runs the compliant public-source discovery pipeline
 * for the seeded owner (or one source). Useful for local cron / cron testing.
 *
 *   npm run discover            # all due, enabled, automatable sources
 *   npm run discover <sourceId> # a single source
 *
 * NOTE: with the seeded example.* URLs this will mostly error/skip (they are
 * placeholders). Point Sources at real PUBLIC pages/feeds and implement the
 * site-specific parsers in src/lib/ingestion/parsers to get live results.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runDiscoveryForSource, runDueDiscovery } from "../src/lib/ingestion";

const db = new PrismaClient();

async function main() {
  const sourceId = process.argv[2];
  const owner = await db.user.findFirst();
  if (!owner) throw new Error("No user — run `npm run db:seed` first.");

  console.log("🔎 Running discovery…");
  const results = sourceId
    ? [await runDiscoveryForSource(sourceId)]
    : await runDueDiscovery(owner.id);

  for (const r of results) {
    console.log(
      `  • ${r.sourceId}: ${r.status} — found ${r.found}, created ${r.created}, updated ${r.updated}` +
        (r.error ? ` (${r.error})` : ""),
    );
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
