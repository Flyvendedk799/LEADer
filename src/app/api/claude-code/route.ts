import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claudeAuthError } from "@/lib/ai/claude-account-http";
import { claudeConnection, disconnectClaudeAccount } from "@/lib/ai/claude-account";

// ─────────────────────────────────────────────────────────────────────────
// The account's own Claude subscription — status and disconnect.
//
// Two of the four routes @flyvendedk799/ai-auth defines for its browser login,
// re-implemented for the App Router. Any signed-in user may call them, not just
// an owner: which provider a deployment uses is an operator decision, but whose
// plan pays is the user's own.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await claudeConnection(user.id));
  } catch (err) {
    return claudeAuthError(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    return NextResponse.json(await disconnectClaudeAccount(user.id));
  } catch (err) {
    return claudeAuthError(err);
  }
}
