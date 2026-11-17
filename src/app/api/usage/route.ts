import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
const reconciliation = z.object({ id: z.string().min(1), actualUsd: z.number().finite().nonnegative().max(1000000), invoiceReference: z.string().trim().min(1).max(200) });
export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    return NextResponse.json(await db.providerUsage.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 50 }));
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const ownerId = await requireOwnerId(), body = reconciliation.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Provide a usage entry, actual USD cost and invoice reference" }, { status: 400 });
    const { id, ...data } = body.data;
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`usage:${ownerId}`}))`;
      return tx.providerUsage.updateMany({ where: { id, ownerId }, data });
    });
    return NextResponse.json({ updated: result.count }, { status: result.count ? 200 : 404 });
  } catch (error) { return apiError(error); }
}
