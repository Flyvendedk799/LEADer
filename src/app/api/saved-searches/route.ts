import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { savedSearchSchema } from "@/lib/validators";
import { z } from "zod";

const deleteSchema = z.object({ id: z.string() });

// GET /api/saved-searches — owner's saved searches, newest first.
export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const searches = await db.savedSearch.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(searches);
  } catch {
    return NextResponse.json({ error: "Failed to load saved searches" }, { status: 500 });
  }
}

// POST /api/saved-searches — persist a filter set under a name.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json();
    const parsed = savedSearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const search = await db.savedSearch.create({
      data: { ownerId, name: parsed.data.name, filters: parsed.data.filters as object },
    });
    return NextResponse.json(search);
  } catch {
    return NextResponse.json({ error: "Failed to save search" }, { status: 500 });
  }
}

// DELETE /api/saved-searches — remove a saved search by id.
export async function DELETE(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await db.savedSearch.deleteMany({ where: { id: parsed.data.id, ownerId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete saved search" }, { status: 500 });
  }
}
