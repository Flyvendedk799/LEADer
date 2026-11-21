import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";

const terms = z.array(z.string().trim().min(1).max(200)).max(60);
const lanePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(5).max(4000),
    active: z.boolean(),
    queryTemplates: terms,
    positiveKeywords: terms,
    negativeKeywords: terms,
    evidenceRequirements: terms,
    conversionGuidance: z.string().max(4000).nullable(),
    scoringConfig: z.record(z.number()).nullable(),
  })
  .partial()
  .strict();

// GET/PATCH /api/ops/lanes/:id (id or slug) — inspect and tune a discovery lane.
async function findLane(ownerId: string, idOrSlug: string) {
  return db.discoveryLane.findFirst({ where: { ownerId, OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwnerId();
    const lane = await findLane(ownerId, (await props.params).id);
    return lane ? NextResponse.json(lane) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwnerId();
    const lane = await findLane(ownerId, (await props.params).id);
    if (!lane) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { scoringConfig, ...data } = lanePatchSchema.parse(await req.json().catch(() => ({})));
    const updated = await db.discoveryLane.update({
      where: { id: lane.id },
      data: {
        ...data,
        ...(scoringConfig !== undefined ? { scoringConfig: scoringConfig === null ? Prisma.DbNull : scoringConfig } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err);
  }
}
