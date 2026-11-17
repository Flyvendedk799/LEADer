import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";

// Rehearsal only: a new local database, never an existing restore target.
const source = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(source.hostname)) throw new Error("Restore rehearsal requires a local source database");
const name = `leader_restore_${randomUUID().replaceAll("-", "")}`;
const target = new URL(source); target.pathname = `/${name}`;
const db = new PrismaClient(), restored = new PrismaClient({ datasources: { db: { url: target.toString() } } });
const pgArgs = ["-h", source.hostname, "-p", source.port || "5432", "-U", decodeURIComponent(source.username)];
const environment = { ...process.env, PGPASSWORD: decodeURIComponent(source.password) };
const dump = `tmp/${name}.dump`;
function client(command: string, args: string[], input: number | "ignore", output: number | "pipe") {
  const result = spawnSync("docker", ["run", "--rm", "-i", "--network", "host", "-e", "PGPASSWORD", process.env.PG_CLIENT_IMAGE || "postgres:18-alpine", command, ...args], { env: environment, stdio: [input, output, "pipe"] });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.toString().slice(0, 1000) || result.error?.message}`);
}
async function fingerprints(client: PrismaClient) {
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const result: Record<string, unknown> = {};
  for (const { tablename } of tables) {
    const table = '"' + tablename.replaceAll('"', '""') + '"';
    result[tablename] = await client.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS checksum FROM ${table} t`);
  }
  return result;
}
async function main() {
  let created = false;
  mkdirSync("tmp", { recursive: true });
  try {
    const before = await fingerprints(db);
    const output = openSync(dump, "wx", 0o600);
    try { client("pg_dump", [...pgArgs, "-d", source.pathname.slice(1), "--format=custom"], "ignore", output); } finally { closeSync(output); }
    await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    const input = openSync(dump, "r");
    try { client("pg_restore", [...pgArgs, "-d", name, "--no-owner", "--exit-on-error"], input, "pipe"); } finally { closeSync(input); }
    assert.deepEqual(await fingerprints(restored), before, "all restored rows, including sealed credentials, match the source");
    console.log(`PASS: backup and restore matched all ${Object.keys(before).length} public tables in an isolated database`);
  } finally {
    await restored.$disconnect();
    if (created) await db.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await db.$disconnect();
    try { unlinkSync(dump); } catch { /* no dump created */ }
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
