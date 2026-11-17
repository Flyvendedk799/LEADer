import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, HttpError } from "@/lib/api";
import { nineAmCopenhagen } from "@/lib/dates";

const schema = z.object({ kind: z.enum(["CONTACTED", "PROPOSAL"]), summary: z.string().trim().min(1).max(2000), followUpDays: z.number().int().min(1).max(90).default(3), requestId: z.string().uuid() });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwnerId(), { id } = await params;
    const body = schema.parse(await req.json());
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contact:${ownerId}:${id}`}))`;
      const deal = await tx.deal.findFirst({ where: { id, ownerId } });
      if (!deal) throw new HttpError(404, "Deal not found");
      const existing = await tx.touchpoint.findFirst({ where: { id: body.requestId, ownerId, dealId: id } });
      if (existing) return { touchpoint: existing };
      const touchpoint = await tx.touchpoint.create({ data: { id: body.requestId, ownerId, dealId: id, accountId: deal.accountId, kind: "NOTE", summary: body.summary, outcome: body.kind, metadata: { sentExternally: true } } });
      await tx.deal.update({ where: { id }, data: { status: body.kind, nextAction: "Follow up on the external message or proposal." } });
      const task = await tx.task.create({ data: { ownerId, dealId: id, accountId: deal.accountId, title: body.kind === "PROPOSAL" ? "Follow up on proposal" : "Follow up on outreach", dueAt: nineAmCopenhagen(new Date(), body.followUpDays) } });
      return { touchpoint, task };
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
