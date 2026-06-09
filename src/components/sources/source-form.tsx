"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_TYPE_META } from "@/lib/display";
import { toast } from "@/hooks/use-toast";
import type { MonitorFrequency, SourceType, Workspace } from "@/lib/types";

/** Minimal Source shape shared by the form (edit mode) and the table. */
export interface SourceRow {
  id: string;
  name: string;
  url: string | null;
  type: SourceType;
  workspace: Workspace;
  frequency: MonitorFrequency;
  keywords: string[];
  country: string | null;
  region: string | null;
  category: string | null;
  enabled: boolean;
  parserKey: string | null;
  notes: string | null;
  lastCheckedAt: string | Date | null;
  _count?: { opportunities: number };
}

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_META) as SourceType[];
const WORKSPACES: Workspace[] = ["DK", "GLOBAL"];
const FREQUENCIES: MonitorFrequency[] = ["MANUAL", "HOURLY", "DAILY", "WEEKLY"];

const WORKSPACE_LABELS: Record<Workspace, string> = {
  DK: "Denmark (DK)",
  GLOBAL: "Global",
};
const FREQUENCY_LABELS: Record<MonitorFrequency, string> = {
  MANUAL: "Manual",
  HOURLY: "Hourly",
  DAILY: "Daily",
  WEEKLY: "Weekly",
};

export function SourceForm({
  source,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  source?: SourceRow;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(source);

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(source?.name ?? "");
  const [url, setUrl] = React.useState(source?.url ?? "");
  const [type, setType] = React.useState<SourceType>(source?.type ?? "PUBLIC_WEB");
  const [workspace, setWorkspace] = React.useState<Workspace>(source?.workspace ?? "DK");
  const [frequency, setFrequency] = React.useState<MonitorFrequency>(source?.frequency ?? "DAILY");
  const [keywords, setKeywords] = React.useState((source?.keywords ?? []).join(", "));
  const [country, setCountry] = React.useState(source?.country ?? "");
  const [region, setRegion] = React.useState(source?.region ?? "");
  const [category, setCategory] = React.useState(source?.category ?? "");
  const [parserKey, setParserKey] = React.useState(source?.parserKey ?? "");
  const [enabled, setEnabled] = React.useState(source?.enabled ?? true);
  const [notes, setNotes] = React.useState(source?.notes ?? "");

  const automatable = SOURCE_TYPE_META[type].automatable;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name,
      url: url.trim() || undefined,
      type,
      workspace,
      // Manual-only source types can't be automated, so the frequency field is
      // disabled in the UI. Force MANUAL so a stale value can't slip through.
      frequency: automatable ? frequency : "MANUAL",
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      country: country.trim() || undefined,
      region: region.trim() || undefined,
      category: category.trim() || undefined,
      parserKey: parserKey.trim() || undefined,
      enabled,
      notes: notes.trim() || undefined,
    };

    try {
      const res = await fetch(
        isEditing ? `/api/sources/${source!.id}` : "/api/sources",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        setError("Could not save the source. Check the fields and try again.");
        toast.error("Could not save the source", "Check the fields and try again.");
        setSubmitting(false);
        return;
      }
      toast.success(isEditing ? "Source updated" : "Source added", name);
      setOpen(false);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      toast.error("Network error", "Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" />
            Add source
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit source" : "Add source"}</DialogTitle>
          <DialogDescription>
            Public sources are monitored automatically; community sources are manual-only.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="source-name">Name</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Erhvervshus Midtjylland — vouchers"
              required
              minLength={2}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="source-url">URL</Label>
            <Input
              id="source-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SourceType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SOURCE_TYPE_META[t].label}
                      {!SOURCE_TYPE_META[t].automatable ? " · manual" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Workspace</Label>
              <Select value={workspace} onValueChange={(v) => setWorkspace(v as Workspace)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACES.map((w) => (
                    <SelectItem key={w} value={w}>
                      {WORKSPACE_LABELS[w]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!automatable && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Manual-only source — discovery runs are disabled; use Community Import.
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as MonitorFrequency)}
                disabled={!automatable}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="source-parser">Parser key</Label>
              <Input
                id="source-parser"
                value={parserKey}
                onChange={(e) => setParserKey(e.target.value)}
                placeholder="Optional site-specific extractor"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="source-keywords">Keywords</Label>
            <Input
              id="source-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Comma-separated, e.g. AI, MVP, fullstack, voucher"
            />
            <p className="text-xs text-muted-foreground">
              Used to filter and rank candidates during discovery.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="source-country">Country</Label>
              <Input
                id="source-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="DK"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="source-region">Region</Label>
              <Input
                id="source-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="source-category">Category</Label>
              <Input
                id="source-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-surface/50 px-3 py-2.5">
            <div>
              <Label htmlFor="source-enabled" className="text-foreground">
                Enabled
              </Label>
              <p className="text-xs text-muted-foreground">
                Disabled sources are skipped by discovery runs.
              </p>
            </div>
            <Switch id="source-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="source-notes">Notes</Label>
            <Textarea
              id="source-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this source…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Save changes" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
