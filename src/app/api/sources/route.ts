import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { sourceCreateSchema } from "@/lib/validators";
import { assertPublicUrl, SsrfError } from "@/lib/ingestion/net";
import { AUTOMATABLE_SOURCE_TYPES } from "@/lib/types";
import { apiError } from "@/lib/api";

// GET /api/sources — list the current owner's sources (newest first) with opportunity counts.
export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const sources = await db.source.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { opportunities: true } } },
    });
    return NextResponse.json(sources);
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/sources — create a source for the current owner.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json();
    const parsed = sourceCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { url, ...rest } = parsed.data;

    // Block private/localhost/metadata URLs for auto-crawled source types so a
    // scheduled discovery run can't be pointed at an internal endpoint (SSRF).
    if (url && AUTOMATABLE_SOURCE_TYPES.includes(rest.type)) {
      try {
        await assertPublicUrl(url);
      } catch (e) {
        if (e instanceof SsrfError) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
        throw e;
      }
    }

    const source = await db.source.create({
      data: {
        ...rest,
        url: url || null,
        ownerId,
      },
      include: { _count: { select: { opportunities: true } } },
    });
    return NextResponse.json(source, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
