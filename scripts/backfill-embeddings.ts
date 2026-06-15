/**
 * Backfill semantic-search embeddings for every opportunity missing one.
 *
 *   npm run embeddings:backfill
 *
 * Uses the configured LLM embeddings endpoint when LLM_API_KEY is set, otherwise
 * a deterministic local vector (works fully offline). Safe to re-run.
 */
import "dotenv/config";
import { backfillEmbeddings } from "../src/lib/opportunities/similar";
import { db } from "../src/lib/db";

async function main() {
  console.log("🧠 Backfilling embeddings…");
  const { embedded, total } = await backfillEmbeddings();
  console.log(`✅ Embedded ${embedded}/${total} opportunities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
