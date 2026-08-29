import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { claudeAccountStore } from "@/lib/ai/credentials";
import { forgetLogin } from "@/lib/ai/claude-login";

// ─────────────────────────────────────────────────────────────────────────
// GET    /api/claude-code — is this user's Claude subscription connected?
// DELETE /api/claude-code — disconnect it.
//
// The shape matches what `@flyvendedk799/ai-auth/react`'s ClaudeTerminal expects,
// because that component is what drives these from Settings.
//
// Any signed-in user may call these, not just an owner: which provider LEADer
// uses is an operator decision, but *whose plan pays* is the user's own, and a
// per-user credential only an admin could install would be neither.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

const DISCONNECTED = {
  connected: false,
  plan: null,
  expiresAt: null,
  expired: false,
  scopes: [] as string[],
};

export async function GET() {
  try {
    const user = await requireUser();
    const status = await claudeAccountStore().status(user.id);
    return NextResponse.json({ ...status, available: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    forgetLogin(user.id);
    await claudeAccountStore().forget(user.id);
    return NextResponse.json({ ...DISCONNECTED, available: true });
  } catch (err) {
    return apiError(err);
  }
}
