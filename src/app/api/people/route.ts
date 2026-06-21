import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { personCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const accountId = new URL(req.url).searchParams.get("accountId") || undefined;
    const people = await db.person.findMany({
      where: { ownerId, ...(accountId ? { accountId } : {}) },
      include: { account: true, _count: { select: { dealLinks: true, tasks: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ people });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = personCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = { ...parsed.data, email: parsed.data.email || undefined };
    const person = data.email
      ? await db.person.upsert({
          where: { ownerId_email: { ownerId, email: data.email } },
          update: data,
          create: { ownerId, ...data },
        })
      : await db.person.create({ data: { ownerId, ...data } });
    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
