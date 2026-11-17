import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
const source = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(source.hostname)) throw new Error("Browser rehearsal requires a local database server");
const name = `leader_browser_${randomUUID().replaceAll("-", "")}`;
const target = new URL(source); target.pathname = `/${name}`;
const db = new PrismaClient();
const port = process.env.BROWSER_TEST_PORT || "3107";
const environment = { ...process.env, DATABASE_URL: target.toString(), BASE_URL: `http://127.0.0.1:${port}`, PORT: port, WORKER_SCHEDULER_ENABLED: "false", EMAIL_PROVIDER: "console" };
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}
async function main() {
  let created = false;
  try {
    await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    run("npx", ["prisma", "migrate", "deploy"]);
    run("npm", ["run", "db:seed"]);
    run("npm", ["run", "test:e2e"]);
  } finally {
    if (created) await db.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await db.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
