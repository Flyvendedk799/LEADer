import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { completeClaudeLogin } from "@/lib/ai/claude-account";
import { claudeAuthError } from "@/lib/ai/claude-account-http";

// Finish the login with the code the user pasted back from the approval page.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    return NextResponse.json(await completeClaudeLogin(user.id, body.code));
  } catch (err) {
    return claudeAuthError(err);
  }
}
