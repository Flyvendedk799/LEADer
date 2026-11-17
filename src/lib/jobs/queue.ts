import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type QueueTable = "DiscoveryMission" | "WorkflowRun";
// Unit tests exercise the legacy synchronous adapter. All deployed runtimes use the database worker.
export function durableJobsEnabled() { return process.env.NODE_ENV !== "test"; }
function tableName(table: QueueTable) {
  if (table !== "DiscoveryMission" && table !== "WorkflowRun") throw new Error("Invalid queue");
  return `"${table}"`;
}
export async function queueSnapshot(table: QueueTable, ownerId: string) {
  return db.$queryRawUnsafe<Array<{ id: string; status: string }>>(
    `SELECT id, status FROM ${tableName(table)} WHERE "ownerId" = $1 AND status IN ('QUEUED','RUNNING') AND "finishedAt" IS NULL ORDER BY "queuePriority" DESC, "createdAt" ASC`, ownerId);
}
export async function reorderQueue(table: QueueTable, ownerId: string, id: string, action: string) {
  return db.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${tableName(table)} WHERE "ownerId" = $1 AND status = 'QUEUED' ORDER BY "queuePriority" DESC, "createdAt" ASC FOR UPDATE`, ownerId);
    const ids = rows.map(r => r.id), index = ids.indexOf(id);
    if (index < 0) return { moved: false, reason: "not_queued" };
    const target = action === "MOVE_TOP" ? 0 : action === "MOVE_UP" ? Math.max(0, index - 1) : Math.min(ids.length - 1, index + 1);
    if (target === index) return { moved: false, reason: index === 0 ? "already_first" : "already_last" };
    ids.splice(index, 1); ids.splice(target, 0, id);
    for (let i = 0; i < ids.length; i++) await tx.$executeRawUnsafe(`UPDATE ${tableName(table)} SET "queuePriority" = $1 WHERE id = $2 AND "ownerId" = $3 AND status = 'QUEUED'`, ids.length - i, ids[i], ownerId);
    return { moved: true, reason: null };
  });
}
export async function claimJob(table: QueueTable, ownerId: string | null = null) {
  const name = tableName(table), token = randomUUID();
  // A crashed workflow can have externally visible side effects. Require manual inspection rather than replaying it blindly.
  await db.$executeRawUnsafe(`UPDATE ${name} SET status = 'ERROR', "finishedAt" = NOW(), log = array_append(log, 'Worker lease expired; inspect partial results before retrying.') WHERE status = 'RUNNING' AND (input->>'source' IS DISTINCT FROM 'paste') AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW()) AND ($1 OR attempts >= 3) AND ($2::text IS NULL OR "ownerId" = $2)`, table === "WorkflowRun", ownerId);
  const jobs = await db.$queryRawUnsafe<Array<{ id: string; ownerId: string; input: unknown; leaseToken: string }>>(`
    UPDATE ${name} SET status = 'RUNNING', "leaseToken" = $1, "leaseUntil" = NOW() + INTERVAL '90 seconds', attempts = attempts + 1
    WHERE id = (SELECT id FROM ${name} WHERE "finishedAt" IS NULL AND ($2::text IS NULL OR "ownerId" = $2) AND ((status = 'QUEUED' AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())) OR (status = 'RUNNING' AND (input->>'source' IS DISTINCT FROM 'paste') AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW()) AND attempts < 3))
      ORDER BY "queuePriority" DESC, "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, "ownerId", input, "leaseToken"`, token, ownerId);
  return jobs[0] ?? null;
}
export async function heartbeatJob(table: QueueTable, id: string, token: string) {
  return db.$executeRawUnsafe(`UPDATE ${tableName(table)} SET "leaseUntil" = NOW() + INTERVAL '90 seconds' WHERE id = $1 AND "leaseToken" = $2`, id, token);
}
export async function releaseJob(table: QueueTable, id: string, token: string) {
  await db.$executeRawUnsafe(`UPDATE ${tableName(table)} SET "leaseUntil" = CASE WHEN status = 'QUEUED' THEN "leaseUntil" ELSE NULL END, "leaseToken" = NULL WHERE id = $1 AND "leaseToken" = $2`, id, token);
}
