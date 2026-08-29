"use client";

import * as React from "react";
import { ClaudeTerminal, type ClaudeConnection } from "@flyvendedk799/ai-auth/react";
import "@flyvendedk799/ai-auth/react/terminal.css";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────────────────
// Connect a Claude subscription to *this* account.
//
// The alternative — reading the `claude` login on the server's machine — is
// right for a self-hosted box and wrong for a shared one: every user's calls
// would be billed to whoever set the server up. This puts each person's own plan
// behind their own calls.
//
// The component is the library's, deliberately: it mirrors the shell session the
// `claude` CLI runs (print a URL, approve in a browser, paste the code back)
// rather than dressing an OAuth flow up as a wizard, and no token ever reaches
// the browser. Its stylesheet reads our design tokens where we have them.
//
// Worth telling users, because the consent screen says so: the flow uses Claude
// Code's own client id, so that is the name Anthropic shows on approval.
// ─────────────────────────────────────────────────────────────────────────

export function ClaudeSubscriptionPanel({
  onChange,
}: {
  onChange?: (connection: ClaudeConnection | null) => void;
}) {
  const [connection, setConnection] = React.useState<ClaudeConnection | null>(null);

  const report = React.useCallback(
    (next: ClaudeConnection | null) => {
      setConnection(next);
      onChange?.(next);
    },
    [onChange],
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Your Claude subscription</span>
        {connection?.connected ? (
          <Badge variant="secondary">
            Connected{connection.plan ? ` · ${connection.plan}` : ""}
          </Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Sign in to run LEADer&apos;s AI on your own Claude plan, billed to you rather than to this
        server. The approval screen is Anthropic&apos;s and says <strong>Claude Code</strong>,
        because this is the same login that CLI performs. LEADer stores the credential encrypted
        and never shows it back to the browser.
      </p>
      <ClaudeTerminal onChange={report} />
      <p className="text-xs leading-5 text-muted-foreground">
        Leave this disconnected to fall back to the <code>claude</code> login on the machine
        running LEADer, which is what a self-hosted instance usually wants.
      </p>
    </div>
  );
}
