import { isSourceDue } from "../src/lib/ingestion";
import { AUTOMATABLE_SOURCE_TYPES } from "../src/lib/types";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { ensureDefaultDiscoveryLanes } from "../src/lib/crm/lanes";
import { companyProfile } from "../src/lib/company-profile";
import { discoveryProviderReadiness } from "../src/lib/discovery";
import { db } from "../src/lib/db";
import { claimJob, heartbeatJob, releaseJob, type QueueTable } from "../src/lib/jobs/queue";
import { executeDiscoveryMission } from "../src/lib/crm";
import { executeWorkflowRun } from "../src/lib/workflows/playbooks";
import { discoveryRunCreateSchema } from "../src/lib/validators";
import { workflowRunInputSchema } from "../src/lib/workflows/types";
import { queueDueWorkflowPresetsAllOwners } from "../src/lib/workflows/preset-runs";

const workerId = process.env.LEADER_WORKER_ID || `worker:${randomUUID()}`;
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function execute(table: QueueTable) {
  const job = await claimJob(table);
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void heartbeatJob(table, job.id, job.leaseToken).then(count => {
      // Fail closed before lease takeover: an old worker must not continue writing.
      if (count !== 1) process.exit(1);
    }).catch(() => process.exit(1));
  }, 15_000);
  try {
    if (table === "DiscoveryMission") {
      await executeDiscoveryMission(job.ownerId, job.id, discoveryRunCreateSchema.parse(job.input), job.leaseToken);
    } else {
      await executeWorkflowRun(job.ownerId, job.id, workflowRunInputSchema.parse(job.input), job.leaseToken);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker failed";
    const retry = table === "DiscoveryMission" && /429|50[0234]|timeout|timed out|network|fetch failed/i.test(message);
    const paused = /allowance|paid .* paused|reserved-spend budget|paid services paused/i.test(message);
    await db.$executeRawUnsafe(`UPDATE "${table}" SET status = CASE WHEN $4 AND attempts < 3 THEN 'QUEUED' WHEN $5 THEN 'BUDGET_PAUSED' ELSE 'ERROR' END, "finishedAt" = CASE WHEN $4 AND attempts < 3 THEN NULL ELSE NOW() END, "leaseUntil" = CASE WHEN $4 AND attempts < 3 THEN NOW() + INTERVAL '60 seconds' * attempts ELSE NULL END, log = array_append(log, $1) WHERE id = $2 AND "leaseToken" = $3 AND status <> 'CANCELED'`, message, job.id, job.leaseToken, retry, paused);
    console.error(message);
  } finally {
    clearInterval(heartbeat);
    await releaseJob(table, job.id, job.leaseToken);
  }
  return true;
}

async function schedule() {
  await db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(17072026) AS locked`;
    if (!lock.locked) return;
    await queueDueWorkflowPresetsAllOwners();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const part = (name: string) => parts.find(p => p.type === name)?.value ?? "";

    const day = `${part("year")}-${part("month")}-${part("day")}`;
    for (const user of await tx.user.findMany({ select: { id: true, companyProfile: true, aiKeys: true } })) {
      const profile = companyProfile(user.companyProfile);
      if (!profile.scheduledDiscovery) continue;
      await ensureDefaultDiscoveryLanes(user.id);
      if (!profile.starterSourcesInstalled) {
      if (!await tx.source.findFirst({ where: { ownerId: user.id, url: "https://ehsys.dk/indkoeb/alle" } })) {
        await tx.source.create({ data: { ownerId: user.id, name: "EHSYS public procurement", url: "https://ehsys.dk/indkoeb/alle", type: "PROCUREMENT", parserKey: "ehsys-procurement", frequency: "DAILY", keywords: ["software", "udvikling", "digital", "teknisk", "data"] } });
      }
      if (!await tx.source.findFirst({ where: { ownerId: user.id, url: "https://dba-consult.dk/jobs/" } })) {
        await tx.source.create({ data: { ownerId: user.id, name: "dba consult freelance assignments", url: "https://dba-consult.dk/jobs/", type: "PUBLIC_WEB", parserKey: "dba-assignments", frequency: "DAILY", keywords: ["software", "developer", "udvikler", "application", "data", "integration", "kubernetes", "platform"] } });
      }
      if (!await tx.source.findFirst({ where: { ownerId: user.id, url: "https://needconsult.dk/it-freelance-opgaver/" } })) {
        await tx.source.create({ data: { ownerId: user.id, name: "Need Consult open freelance assignments", url: "https://needconsult.dk/it-freelance-opgaver/", type: "PUBLIC_WEB", parserKey: "need-assignments", frequency: "DAILY", keywords: ["software", "developer", "udvikler", "application", "data", "integration", "cloud", "platform", "UX/UI"] } });
      }
      await tx.$executeRaw`UPDATE "User" SET "companyProfile" = COALESCE("companyProfile", '{}'::jsonb) || '{"starterSourcesInstalled":true}'::jsonb WHERE id = ${user.id}`;
      }
      const sources = await tx.source.findMany({ where: { ownerId: user.id, enabled: true } });
      for (const source of sources) {
        if (!AUTOMATABLE_SOURCE_TYPES.includes(source.type) || !isSourceDue(source)) continue;
        const queued = await tx.workflowRun.findFirst({ where: { ownerId: user.id, status: { in: ["QUEUED", "RUNNING"] }, input: { path: ["options", "dailySweep", "sourceId"], equals: source.id } } });
        if (queued) continue;
        const id = `source:${source.id}:${new Date().toISOString().slice(0, 13)}`;
        await tx.workflowRun.upsert({ where: { id }, update: {}, create: { id, ownerId: user.id, playbook: "daily-sweep", trigger: "scheduled", status: "QUEUED", input: { playbook: "daily-sweep", workspace: source.workspace, options: { dailySweep: { sourceId: source.id, includeAlerts: false } } } } });
      }
      if (Number(part("hour")) < profile.discoveryHour) continue;
      if (profile.dailySearchQueries > 0 && profile.monthlySearchQueries > 0 && discoveryProviderReadiness(user.aiKeys).searchConfigured) {
        const lanes = await tx.discoveryLane.findMany({ where: { ownerId: user.id, active: true, slug: { notIn: ["community-manual", "warm-network"] } } });
        for (const lane of lanes) {
          const workspaces = profile.internationalDiscovery && ["client-projects", "freelance-contracts", "agency-partners"].includes(lane.slug) ? ["DK", "GLOBAL"] as const : [lane.workspace];
          for (const workspace of workspaces) {
            const input = { laneId: lane.id, workspace, useAiPlanner: false, searchMode: "focused", maxResults: 12, includeWeb: true, includeSources: false, provider: "auto" };
            await tx.discoveryMission.upsert({ where: { id: `discovery:${user.id}:${lane.id}:${workspace}:${day}` }, update: {}, create: { id: `discovery:${user.id}:${lane.id}:${workspace}:${day}`, ownerId: user.id, laneId: lane.id, query: lane.queryTemplates[0] || lane.name, workspace, status: "QUEUED", input } });
          }
        }
      }
      await tx.workflowRun.upsert({
        where: { id: `daily:${user.id}:${day}` }, update: {},
        create: { id: `daily:${user.id}:${day}`, ownerId: user.id, playbook: "daily-sweep", trigger: "scheduled", status: "QUEUED", input: { playbook: "daily-sweep", workspace: "DK" } },
      });
    }
  }, { timeout: 60_000 });
}
async function main() {
  console.log("LEADer persistent worker started");
  const pulse = setInterval(() => {
    void db.workerHeartbeat.upsert({ where: { id: workerId }, create: { id: workerId }, update: { updatedAt: new Date() } }).catch(() => process.exit(1));
  }, 15_000);
  let lastSchedule = 0;
  try {
    while (!stopping) {
      if (process.env.WORKER_SCHEDULER_ENABLED !== "false" && Date.now() - lastSchedule > 60_000) { await schedule(); lastSchedule = Date.now(); }
      const discovery = await execute("DiscoveryMission");
      const workflow = stopping ? false : await execute("WorkflowRun");
      if (!discovery && !workflow) await pause(2_000);
    }
  } finally { clearInterval(pulse); await db.workerHeartbeat.deleteMany({ where: { id: workerId } }); await db.$disconnect(); }
}
void main().catch(async error => { console.error(error); await db.$disconnect(); process.exit(1); });
