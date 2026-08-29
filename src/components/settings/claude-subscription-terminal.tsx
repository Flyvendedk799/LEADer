"use client";

import * as React from "react";
import { ClaudeTerminal, setClaudeApiPrefix, type ClaudeConnection } from "@flyvendedk799/ai-auth/react";
import "@flyvendedk799/ai-auth/react/terminal.css";

// ─────────────────────────────────────────────────────────────────────────
// Connecting your own Claude subscription.
//
// The component is @flyvendedk799/ai-auth's, shown as the terminal session it
// mirrors: it prints a URL, you approve in a browser, you paste a code back —
// the same flow `claude` runs in a shell. No token ever reaches the browser;
// the server holds the PKCE verifier for the length of the login and the
// credential afterwards.
// ─────────────────────────────────────────────────────────────────────────

// LEADer mounts the four routes at the library's default prefix. Set anyway, so
// moving them is a one-line change here rather than a silent 404.
setClaudeApiPrefix("/api/claude-code");

export function ClaudeSubscriptionTerminal({
  onChange,
}: {
  onChange?: (connection: ClaudeConnection | null) => void;
}) {
  return (
    <div className="grid gap-2">
      <ClaudeTerminal onChange={onChange} />
      <p className="text-xs text-muted-foreground">
        The approval screen says Claude Code — that is the OAuth client this flow uses. Check
        Anthropic&apos;s subscription terms before pointing a shared deployment at consumer plans.
      </p>
    </div>
  );
}
