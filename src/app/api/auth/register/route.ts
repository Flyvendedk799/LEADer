import { NextResponse } from "next/server";
import { register } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const user = await register(parsed.data, {
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    return apiError(err);
  }
}
