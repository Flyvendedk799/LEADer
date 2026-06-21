"use client";

import * as React from "react";
import { Loader2, Mail, PenLine, Sparkles, Target, ClipboardCheck } from "lucide-react";
import type { AiAction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const ACTIONS: { action: AiAction; label: string; icon: React.ElementType }[] = [
  { action: "qualifyLead", label: "Qualify", icon: ClipboardCheck },
  { action: "draftOutreach", label: "Outreach", icon: Mail },
  { action: "draftProposal", label: "Proposal", icon: PenLine },
  { action: "draftFollowUp", label: "Follow-up", icon: Sparkles },
  { action: "nextBestAction", label: "Next action", icon: Target },
];

export function DealAiPanel({ dealId }: { dealId: string }) {
  const [pending, setPending] = React.useState<AiAction | null>(null);
  const [result, setResult] = React.useState<string | null>(null);

  async function run(action: AiAction) {
    setPending(action);
    setResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, dealId, save: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI request failed");
      setResult(data.text || JSON.stringify(data.data, null, 2));
      toast.success("Asset saved", action);
    } catch (err) {
      toast.error("AI failed", err instanceof Error ? err.message : "AI request failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Conversion assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map(({ action, label, icon: Icon }) => (
            <Button key={action} variant="outline" size="sm" className="justify-start" disabled={pending != null} onClick={() => run(action)}>
              {pending === action ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              {label}
            </Button>
          ))}
        </div>
        {result && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-sm leading-relaxed">
            {result}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
