import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwnerId(), { id } = await params;
    const { content } = z.object({ content: z.string().trim().min(1).max(100000) }).parse(await req.json());
    const original = await db.conversionAsset.findFirst({ where: { id, ownerId } });
    if (!original) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const version = await db.conversionAsset.create({ data: { ownerId, dealId: original.dealId, accountId: original.accountId, candidateId: original.candidateId, kind: original.kind, title: original.title, content, model: "user-edited", promptSnapshot: JSON.stringify({ parentVersionId: id }) } });
    return NextResponse.json(version, { status: 201 });
  } catch (error) { return apiError(error); }
}
