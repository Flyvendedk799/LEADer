"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  AiProviderFields,
  aiProviderPayload,
  initialAiProviderState,
  type PublicAiKeys,
} from "@/components/settings/ai-provider-fields";

type OnboardingUser = {
  name: string | null;
  headline: string | null;
  bio: string | null;
  preferredProjectTypes: string[];
  excludedCategories: string[];
  budgetMaxDkk: number;
  preferredCurrency: string;
  aiKeys: PublicAiKeys;
};

const CURRENCIES = ["DKK", "EUR", "USD"] as const;

function toList(s: string): string[] {
  return s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function OnboardingFlow({ user }: { user: OnboardingUser }) {
  const router = useRouter();
  const [name, setName] = React.useState(user.name ?? "");
  const [headline, setHeadline] = React.useState(user.headline ?? "");
  const [bio, setBio] = React.useState(user.bio ?? "");
  const [projectTypes, setProjectTypes] = React.useState(
    (user.preferredProjectTypes ?? []).join(", "),
  );
  const [excluded, setExcluded] = React.useState(
    (user.excludedCategories ?? []).join(", "),
  );
  const [budgetMaxDkk, setBudgetMaxDkk] = React.useState(String(user.budgetMaxDkk ?? 100000));
  const [currency, setCurrency] = React.useState(user.preferredCurrency || "DKK");
  const [aiState, setAiState] = React.useState(() => initialAiProviderState(user.aiKeys));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          headline: headline.trim() || undefined,
          bio: bio.trim() || undefined,
          preferredProjectTypes: toList(projectTypes),
          excludedCategories: toList(excluded),
          budgetMaxDkk: Number(budgetMaxDkk) || undefined,
          preferredCurrency: currency,
          aiKeys: aiProviderPayload(aiState),
          completeOnboarding: true,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to finish setup");
      }

      toast.success("Workspace ready");
      router.push("/");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error("Couldn't finish setup", message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Target className="h-5 w-5" />
          </div>
          <CardTitle>Set up LEADer</CardTitle>
          <CardDescription>
            Add the profile context LEADer should score against, then choose an API key or local subscription provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Profile</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                This is used for opportunity scoring and AI drafting.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="onboarding-name">Name</Label>
                <Input
                  id="onboarding-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="onboarding-headline">Headline</Label>
                <Input
                  id="onboarding-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Fullstack dev, AI builder, MVP advisor"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="onboarding-bio">Bio</Label>
              <Textarea
                id="onboarding-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="What you do, who you help, and what kind of work you want."
                disabled={saving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="onboarding-project-types">Preferred project types</Label>
                <Input
                  id="onboarding-project-types"
                  value={projectTypes}
                  onChange={(e) => setProjectTypes(e.target.value)}
                  placeholder="fullstack, AI, MVP, startup"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="onboarding-excluded">Excluded categories</Label>
                <Input
                  id="onboarding-excluded"
                  value={excluded}
                  onChange={(e) => setExcluded(e.target.value)}
                  placeholder="hardware, recruitment"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="onboarding-budget">Preferred max budget</Label>
                <Input
                  id="onboarding-budget"
                  type="number"
                  min={1}
                  value={budgetMaxDkk}
                  onChange={(e) => setBudgetMaxDkk(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="onboarding-currency">Preferred currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={saving}>
                  <SelectTrigger id="onboarding-currency">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">AI provider</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                API keys, Codex subscription, and Claude Code subscription can be changed later in Settings.
              </p>
            </div>
            <AiProviderFields
              state={aiState}
              onChange={setAiState}
              aiKeys={user.aiKeys}
              disabled={saving}
            />
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {saving ? "Finishing..." : "Finish setup"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
