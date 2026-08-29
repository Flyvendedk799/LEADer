import { NextResponse } from "next/server";
import { startClaudeLogin } from "@flyvendedk799/ai-auth";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { PENDING_TTL_MS, rememberLogin } from "@/lib/ai/claude-login";

// POST /api/claude-code/login — begin a Claude subscription login.
//
// Returns the URL to approve at. The PKCE verifier stays on the server: it is
// the only thing binding the pasted code to the session that asked for it, and
// this is a public client with no secret behind it.

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    const started = startClaudeLogin();
    rememberLogin(user.id, { verifier: started.verifier, state: started.state });
    return NextResponse.json({
      url: started.url,
      expiresInSeconds: Math.round(PENDING_TTL_MS / 1000),
    });
  } catch (err) {
    return apiError(err);
  }
}
