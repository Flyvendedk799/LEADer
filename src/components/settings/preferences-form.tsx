"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save } from "lucide-react";
import type { ExportFormat, ExportPreferences } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "pdf", label: "PDF" },
  { value: "markdown", label: "Markdown" },
  { value: "notion", label: "Notion (Markdown)" },
];

type PrefsUser = {
  exportPrefs: ExportPreferences | null;
};

const DEFAULT_PREFS: ExportPreferences = {
  defaultFormat: "csv",
  includeNotes: true,
  includeSummary: true,
};

export function PreferencesForm({ user }: { user: PrefsUser }) {
  const router = useRouter();
  const prefs = { ...DEFAULT_PREFS, ...(user.exportPrefs ?? {}) };

  const [defaultFormat, setDefaultFormat] = React.useState<ExportFormat>(prefs.defaultFormat);
  const [includeNotes, setIncludeNotes] = React.useState<boolean>(prefs.includeNotes);
  const [includeSummary, setIncludeSummary] = React.useState<boolean>(prefs.includeSummary);

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const exportPrefs: ExportPreferences = { defaultFormat, includeNotes, includeSummary };
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportPrefs }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save preferences");
      }
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export preferences</CardTitle>
        <CardDescription>Defaults applied when you export opportunities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="defaultFormat">Default format</Label>
          <Select
            value={defaultFormat}
            onValueChange={(v) => setDefaultFormat(v as ExportFormat)}
          >
            <SelectTrigger id="defaultFormat">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Include notes</p>
            <p className="text-xs text-muted-foreground">Append your notes to each exported row.</p>
          </div>
          <Switch
            checked={includeNotes}
            onCheckedChange={setIncludeNotes}
            aria-label="Include notes in export"
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Include AI summary</p>
            <p className="text-xs text-muted-foreground">
              Add the generated summary column to exports.
            </p>
          </div>
          <Switch
            checked={includeSummary}
            onCheckedChange={setIncludeSummary}
            aria-label="Include AI summary in export"
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
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </CardFooter>
    </Card>
  );
}
