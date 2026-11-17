import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    const pulse = await db.workerHeartbeat.findFirst({ where: id ? { id } : {}, orderBy: { updatedAt: "desc" } });
    const healthy = Boolean(pulse && Date.now() - pulse.updatedAt.getTime() < 60_000);
    return NextResponse.json({ worker: healthy ? "up" : "down" }, { status: healthy ? 200 : 503 });
  } catch { return NextResponse.json({ worker: "down" }, { status: 503 }); }
}
