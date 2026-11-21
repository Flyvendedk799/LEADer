"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }) : "—");

export function ApiTokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    const res = await fetch("/api/tokens", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setTokens(res.ok ? data.tokens : []);
  }, []);
  useEffect(() => void load(), [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const days = Number(data.get("days") || 0);
    setCreating(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(data.get("name") || "API token"), expiresInDays: days > 0 ? days : null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not create token");
      setFresh(body.token.token);
      form.reset();
      await load();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) toast({ title: "Could not revoke token", variant: "destructive" });
    await load();
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast({ title: "Copied" }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          API access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          A token acts as you on every API route and on the MCP server at <code>{origin}/api/mcp</code>. Send it as{" "}
          <code>Authorization: Bearer ldr_…</code>. Tokens cannot change your password or create more tokens. See docs/API.md.
        </p>

        {fresh && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="font-medium">Copy this token now. It will not be shown again.</p>
            <div className="flex gap-2">
              <Input readOnly value={fresh} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="icon" onClick={() => copy(fresh)} aria-label="Copy token">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Claude Code: <code>claude mcp add --transport http leader {origin}/api/mcp --header &quot;Authorization: Bearer {fresh.slice(0, 10)}…&quot;</code>
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        )}

        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label htmlFor="token-name">Name</Label>
            <Input id="token-name" name="name" placeholder="Claude Code" required maxLength={80} />
          </div>
          <div className="w-32 space-y-1">
            <Label htmlFor="token-days">Expires (days)</Label>
            <Input id="token-days" name="days" type="number" min={0} max={3650} placeholder="never" />
          </div>
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create token
          </Button>
        </form>

        {tokens === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground">No tokens yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {t.name} <code className="text-xs text-muted-foreground">{t.prefix}…</code>
                    {t.revokedAt && <span className="ml-2 text-xs text-destructive">revoked</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {fmt(t.createdAt)} · last used {fmt(t.lastUsedAt)} · expires {t.expiresAt ? fmt(t.expiresAt) : "never"}
                  </div>
                </div>
                {!t.revokedAt && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => revoke(t.id)} aria-label={`Revoke ${t.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
