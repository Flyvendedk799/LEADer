import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const source = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(source.hostname)) throw new Error("Startup regression requires a local database server");
const database = `leader_startup_${randomUUID().replaceAll("-", "")}`;
const target = new URL(source); target.pathname = `/${database}`;
const db = new PrismaClient(), upgraded = new PrismaClient({ datasources: { db: { url: target.toString() } } });
const fixture = mkdtempSync(join(tmpdir(), "leader-startup-"));
const port = process.env.STARTUP_TEST_PORT || "3117";
const baseURL = `http://127.0.0.1:${port}`;
const environment = { ...process.env, DATABASE_URL: target.toString(), PORT: port, EMAIL_PROVIDER: "console", WORKER_SCHEDULER_ENABLED: "false" };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let web: ChildProcess | undefined;
let output = "";

async function main() {
  let created = false;
  try {
    await db.$executeRawUnsafe(`CREATE DATABASE "${database}"`); created = true;
    // Deploy only the migration history that existed before companyProfile.
    cpSync("prisma/schema.prisma", join(fixture, "schema.prisma"));
    mkdirSync(join(fixture, "migrations"));
    for (const entry of readdirSync("prisma/migrations")) {
      if (entry === "migration_lock.toml" || entry < "20261117090000_durable_acquisition") {
        cpSync(join("prisma/migrations", entry), join(fixture, "migrations", entry), { recursive: true });
      }
    }
    const migrate = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", join(fixture, "schema.prisma")], { env: environment, encoding: "utf8" });
    assert.equal(migrate.status, 0, migrate.stderr);
    const id = randomUUID(), email = `startup-${id}@example.invalid`, password = randomUUID();
    const passwordHash = await hashPassword(password);
    await upgraded.$executeRaw`INSERT INTO "User" (id, email, "passwordHash", "updatedAt") VALUES (${id}, ${email}, ${passwordHash}, NOW())`;
    await assert.rejects(() => upgraded.user.findUnique({ where: { email } }), (error: unknown) => error instanceof Error && "code" in error && error.code === "P2022" && error.message.includes("companyProfile"), "reproduces the reported login query failure");

    web = spawn("npm", ["run", "start"], { env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    web.stdout?.on("data", chunk => { output = (output + String(chunk)).slice(-12000); });
    web.stderr?.on("data", chunk => { output = (output + String(chunk)).slice(-12000); });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (web.exitCode !== null) throw new Error(`Production startup exited: ${output}`);
      try {
        if ((await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; }
      } catch { /* wait for migrations and HTTP startup */ }
      await pause(500);
    }
    assert.ok(ready, `Production startup did not become ready: ${output}`);
    const response = await fetch(`${baseURL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).id, id);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "successful login creates a session");
    const current = await fetch(`${baseURL}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(current.status, 200);
    assert.equal((await current.json()).user.id, id);
    const user = await upgraded.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.passwordHash, passwordHash, "existing credentials are preserved");
    assert.equal(user.budgetMaxDkk, 100000, "existing owner settings are preserved");
    assert.equal(user.companyProfile, null);
    const denied = await fetch(`${baseURL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "wrong-password" }) });
    assert.equal(denied.status, 401);
    console.log("PASS: reproduced missing companyProfile, production startup applied pending migrations, existing-account login/session works, incorrect password rejected, data preserved");
  } finally {
    if (web?.pid) {
      try { process.kill(-web.pid, "SIGTERM"); } catch { /* already stopped */ }
      await pause(500);
    }
    await upgraded.$disconnect();
    if (created) await db.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await db.$disconnect();
    rmSync(fixture, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
