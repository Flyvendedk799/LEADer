"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type ProfileUser = {
  name: string | null;
  headline: string | null;
  bio: string | null;
  preferredProjectTypes: string[];
  excludedCategories: string[];
  budgetMaxDkk: number;
  preferredCurrency: string;
};

const CURRENCIES = ["DKK", "EUR", "USD"] as const;

/** comma-separated string ⇆ string[] helpers. */
function toList(s: string): string[] {
  return s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function ProfileForm({ user }: { user: ProfileUser }) {
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

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
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
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save profile");
      }
      setSaved(true);
      toast.success("Settings saved");
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error("Couldn't save settings", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Drives both AI context and scoring. The clearer your profile, the
            sharper your match scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Fullstack dev · AI builder · MVP/product advisor"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="Short description of what you do, who you help, and the kind of work you want."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="projectTypes">Preferred project types</Label>
            <Input
              id="projectTypes"
              value={projectTypes}
              onChange={(e) => setProjectTypes(e.target.value)}
              placeholder="fullstack, AI, MVP, startup"
            />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="excluded">Excluded categories</Label>
            <Input
              id="excluded"
              value={excluded}
              onChange={(e) => setExcluded(e.target.value)}
              placeholder="hardware, recruitment"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. These are deprioritised in discovery and scoring.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="budgetMaxDkk">Preferred max budget (DKK)</Label>
              <Input
                id="budgetMaxDkk"
                type="number"
                min={1}
                className="tnum"
                value={budgetMaxDkk}
                onChange={(e) => setBudgetMaxDkk(e.target.value)}
                placeholder="100000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Preferred currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
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
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
