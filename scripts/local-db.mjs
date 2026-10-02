import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// An optional, persistent local PostgreSQL server. Never connects to a remote DB.
const url = new URL(
  process.env.DATABASE_URL ||
    "postgresql://leader:leader@localhost:5432/leader",
);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error(
    "db:local only supports localhost. Your remote DATABASE_URL was left unchanged.",
  );
const directory = resolve("tmp/pg-data");
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
if (!existsSync(resolve(directory, "PG_VERSION"))) await pg.initialise();
await pg.start();
const name = url.pathname.slice(1);
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [name],
);
await client.end();
if (!result.rowCount) await pg.createDatabase(name);
console.log(
  `PostgreSQL ready on ${url.hostname}:${url.port || 5432}. Data persists in ${directory}.`,
);
console.log(
  "First run: npm run db:migrate:deploy, then npm run db:seed. Start the app with npm run dev in another terminal.",
);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
