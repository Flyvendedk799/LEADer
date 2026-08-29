import { NextResponse } from "next/server";
import {
  ClaudeLoginError,
  exchangeClaudeCode,
  parsePastedCode,
  sameState,
} from "@flyvendedk799/ai-auth";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { claudeAccountStore } from "@/lib/ai/credentials";
import { MAX_CODE_LENGTH, takeLogin } from "@/lib/ai/claude-login";

// POST /api/claude-code/login/complete — finish the login with the pasted code.
//
// The code is traded for tokens here and the result is sealed into AiCredential.
// Nothing about the credential crosses back to the browser: the response is the
// same status line the GET returns.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const entry = takeLogin(user.id);
    if (!entry) {
      return NextResponse.json(
        {
          error: "no_pending_login",
          message: "That login has expired or was never started. Run the command again.",
        },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    if (typeof body.code !== "string" || body.code.length > MAX_CODE_LENGTH) {
      return NextResponse.json(
        { error: "bad_code", message: "Paste the code from the approval page." },
        { status: 400 },
      );
    }

    const parsed = parsePastedCode(body.code);
    if (!parsed) {
      return NextResponse.json(
        { error: "bad_code", message: "That does not look like an authorization code." },
        { status: 400 },
      );
    }

    // The state binds this code to the login *this* user started. A code obtained
    // in somebody else's approval, pasted here, has to be refused — that is the
    // entire job of the parameter.
    if (parsed.state !== null && !sameState(entry.state, parsed.state)) {
      return NextResponse.json(
        {
          error: "state_mismatch",
          message: "That code came from a different login. Start again and use the newest link.",
        },
        { status: 400 },
      );
    }

    try {
      const identity = await exchangeClaudeCode({
        code: parsed.code,
        state: entry.state,
        verifier: entry.verifier,
      });
      const store = claudeAccountStore();
      await store.save(user.id, identity);
      return NextResponse.json({ ...(await store.status(user.id)), available: true });
    } catch (error) {
      if (error instanceof ClaudeLoginError) {
        return NextResponse.json(
          { error: "exchange_failed", message: error.message, restart: error.restart },
          { status: 400 },
        );
      }
      throw error;
    }
  } catch (err) {
    return apiError(err);
  }
}
