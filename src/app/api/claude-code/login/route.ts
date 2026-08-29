import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { beginClaudeLogin } from "@/lib/ai/claude-account";
import { claudeAuthError } from "@/lib/ai/claude-account-http";

// Begin the OAuth login. Returns the URL to approve at; the PKCE verifier stays
// on the server, sealed in the credential table until the code comes back.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    return NextResponse.json(await beginClaudeLogin(user.id));
  } catch (err) {
    return claudeAuthError(err);
  }
}
