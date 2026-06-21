"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  AiProviderFields,
  SearchProviderFields,
  aiProviderPayload,
  initialAiProviderState,
  initialSearchProviderState,
  searchProviderPayload,
  type PublicAiKeys,
} from "./ai-provider-fields";

export function AiProviderForm({ aiKeys }: { aiKeys: PublicAiKeys }) {
  const router = useRouter();
  const [state, setState] = React.useState(() => initialAiProviderState(aiKeys));
  const [searchState, setSearchState] = React.useState(() => initialSearchProviderState(aiKeys));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiKeys: {
            ...aiProviderPayload(state),
            search: searchProviderPayload(searchState),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save AI settings");
      }
      setState((current) => ({ ...current, apiKey: "", clearApiKey: false }));
      setSearchState((current) => ({ ...current, apiKey: "", clearApiKey: false }));
      setSaved(true);
      toast.success("AI and discovery settings saved");
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error("Couldn't save AI settings", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          AI provider
        </CardTitle>
        <CardDescription>
          Choose AI and discovery search providers, save API keys, or use local subscriptions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <AiProviderFields state={state} onChange={setState} aiKeys={aiKeys} disabled={saving} />
        <div className="border-t border-border pt-5">
          <SearchProviderFields
            state={searchState}
            onChange={setSearchState}
            aiKeys={aiKeys}
            disabled={saving}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="justify-between">
        <span
          className={`flex items-center gap-1.5 text-sm text-success transition-opacity ${
            saved ? "opacity-100" : "opacity-0"
          }`}
          aria-live="polite"
        >
          <Check className="h-4 w-4" /> Saved
        </span>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </CardFooter>
    </Card>
  );
}
