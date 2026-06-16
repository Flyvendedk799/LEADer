import { NextResponse } from "next/server";
import { changePassword, createSession, requireUser } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

// Change the signed-in user's password. Revokes all other sessions on success;
// the current session cookie is re-issued so the user stays logged in here.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
    // changePassword revokes every session (incl. this one) — re-issue a fresh
    // cookie so the user who just changed their password stays signed in here.
    await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
