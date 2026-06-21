import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { taskCreateSchema, taskPatchSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const url = new URL(req.url);
    const dealId = url.searchParams.get("dealId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const tasks = await db.task.findMany({
      where: { ownerId, ...(dealId ? { dealId } : {}), ...(status ? { status: status as never } : {}) },
      include: { deal: { include: { account: true } }, account: true, person: true },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 100,
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = taskCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const task = await db.task.create({ data: { ownerId, ...parsed.data } });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = taskPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { id, ...data } = parsed.data;
    const task = await db.task.updateMany({
      where: { id, ownerId },
      data: {
        ...data,
        completedAt: data.status === "DONE" ? new Date() : undefined,
      },
    });
    if (task.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await db.task.findFirst({ where: { id, ownerId } }));
  } catch (err) {
    return apiError(err);
  }
}
