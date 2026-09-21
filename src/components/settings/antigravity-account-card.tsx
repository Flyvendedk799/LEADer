"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  antigravityConnection,
  startAntigravityConnection,
  finishAntigravityConnection,
  removeAntigravityConnection,
} from "@/lib/antigravity-auth.functions";

export function AntigravityAccountCard() {
  const [status, setStatus] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [pastedUrl, setPastedUrl] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);

  React.useEffect(() => {
    antigravityConnection().then((res) => {
      setStatus(res);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const authUrl = await startAntigravityConnection();
      window.open(authUrl, "_blank");
    } catch (err) {
      toast.error("Failed to start Antigravity login");
    } finally {
      setConnecting(false);
    }
  }

  async function handleComplete() {
    if (!pastedUrl) return;
    setConnecting(true);
    try {
      await finishAntigravityConnection(pastedUrl);
      const newStatus = await antigravityConnection();
      setStatus(newStatus);
      setPastedUrl("");
      toast.success("Antigravity connected successfully");
    } catch (err: any) {
      toast.error("Failed to connect Antigravity", err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setConnecting(true);
    try {
      await removeAntigravityConnection();
      setStatus(null);
      toast.success("Disconnected Antigravity");
    } catch (err) {
      toast.error("Failed to disconnect Antigravity");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Your Antigravity subscription</span>
        {status?.connected ? (
          <Badge variant="secondary">Connected</Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </div>
      
      <p className="text-xs leading-5 text-muted-foreground">
        Sign in to run LEADer&apos;s AI on your Antigravity (Gemini Advanced / Code Assist) plan.
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading status...</div>
      ) : status?.connected ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={connecting}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Button onClick={handleConnect} disabled={connecting} variant="secondary">
              Connect Antigravity
            </Button>
            <span className="text-xs text-muted-foreground">
              (Opens in a new tab. Approve and copy the token)
            </span>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="paste-url">Paste token</Label>
            <div className="flex gap-2">
              <Input
                id="paste-url"
                value={pastedUrl}
                onChange={(e) => setPastedUrl(e.target.value)}
                placeholder="Paste the copied token..."
                disabled={connecting}
              />
              <Button onClick={handleComplete} disabled={!pastedUrl || connecting}>
                Verify
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
