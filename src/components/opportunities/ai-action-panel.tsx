"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  FileText,
  Loader2,
  Mail,
  Megaphone,
  PenLine,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AiAction } from "@/lib/types";

const ACTIONS: { action: AiAction; label: string; icon: LucideIcon }[] = [
  { action: "summarize", label: "Summarize", icon: FileText },
  { action: "explainScore", label: "Explain match", icon: Sparkles },
  { action: "draftApplication", label: "Draft application", icon: PenLine },
  { action: "draftPitch", label: "Supplier pitch", icon: Megaphone },
  { action: "draftEmail", label: "Outreach email", icon: Mail },
  { action: "checklist", label: "Apply checklist", icon: CheckSquare },
  { action: "nextAction", label: "Next action", icon: Target },
];

export function AiActionPanel({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<AiAction | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: AiAction) {
    setPending(action);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, opportunityId, save: true }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error((msg as { error?: string }).error || "AI request failed");
      }
      const data = (await res.json()) as { text?: string };
      setResult(data.text ?? "(no text returned)");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          AI assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map(({ action, label, icon: Icon }) => (
            <Button
              key={action}
              variant="outline"
              size="sm"
              className="justify-start"
              aria-label={label}
              disabled={pending != null}
              onClick={() => run(action)}
            >
              {pending === action ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {label}
            </Button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="rounded-md border border-border bg-surface-2/60 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {result}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Falls back to mock output if no LLM key is set. Results are saved as drafts.
        </p>
      </CardContent>
    </Card>
  );
}
