"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  ShieldOff,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SOURCE_TYPE_META } from "@/lib/display";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { SourceForm, type SourceRow } from "@/components/sources/source-form";

interface RunState {
  running: boolean;
  result?: { status: string; found: number; created: number; updated: number; error?: string };
}

export function SourceTable({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();

  const [editing, setEditing] = React.useState<SourceRow | null>(null);
  const [busyToggle, setBusyToggle] = React.useState<string | null>(null);
  const [busyDelete, setBusyDelete] = React.useState<string | null>(null);
  const [runStates, setRunStates] = React.useState<Record<string, RunState>>({});
  // Optimistic enabled overrides so the Switch reflects the change immediately
  // and can be reverted if the PATCH fails.
  const [enabledOverrides, setEnabledOverrides] = React.useState<Record<string, boolean>>({});

  async function toggleEnabled(source: SourceRow, next: boolean) {
    setBusyToggle(source.id);
    setEnabledOverrides((o) => ({ ...o, [source.id]: next }));
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("Failed to update source");
      router.refresh();
    } catch {
      // Revert the optimistic state on failure.
      setEnabledOverrides((o) => ({ ...o, [source.id]: source.enabled }));
      toast.error("Couldn't update source");
    } finally {
      setBusyToggle(null);
    }
  }

  async function handleDelete(source: SourceRow) {
    if (!confirm(`Delete "${source.name}"? Discovered opportunities are kept but unlinked.`)) {
      return;
    }
    setBusyDelete(source.id);
    try {
      await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyDelete(null);
    }
  }

  async function runNow(source: SourceRow) {
    setRunStates((s) => ({ ...s, [source.id]: { running: true } }));
    try {
      const res = await fetch("/api/cron/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const data = (await res.json()) as {
        results?: { status: string; found: number; created: number; updated: number; error?: string }[];
      };
      const result = data.results?.[0];
      setRunStates((s) => ({ ...s, [source.id]: { running: false, result } }));
      if (!res.ok || !result || result.status === "ERROR") {
        toast.error("Run failed", result?.error || "The discovery run did not complete.");
      } else if (result.status === "SKIPPED") {
        toast.success("Run skipped", result.error || "Nothing to do for this source.");
      } else {
        toast.success(
          `Ran "${source.name}"`,
          `Found ${result.found} · ${result.created} new · ${result.updated} updated`,
        );
      }
      router.refresh();
    } catch {
      setRunStates((s) => ({
        ...s,
        [source.id]: {
          running: false,
          result: { status: "ERROR", found: 0, created: 0, updated: 0, error: "Network error" },
        },
      }));
      toast.error("Run failed", "Network error — could not reach the server.");
    }
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Keywords</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last checked</TableHead>
              <TableHead className="text-right">Opportunities</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => {
              const meta = SOURCE_TYPE_META[source.type];
              const run = runStates[source.id];
              return (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="font-medium">{source.name}</div>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span className="max-w-[18rem] truncate">{source.url}</span>
                      </a>
                    )}
                    {run?.result && (
                      <div
                        className={
                          "mt-1 text-xs " +
                          (run.result.status === "SUCCESS"
                            ? "text-success"
                            : run.result.status === "SKIPPED"
                              ? "text-warning"
                              : "text-destructive")
                        }
                      >
                        {run.result.status === "SUCCESS"
                          ? `Found ${run.result.found} · ${run.result.created} new · ${run.result.updated} updated`
                          : `${run.result.status}${run.result.error ? `: ${run.result.error}` : ""}`}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={meta.automatable ? "secondary" : "muted"} className="gap-1">
                      {meta.automatable ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <ShieldOff className="h-3 w-3" />
                      )}
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{source.workspace}</TableCell>
                  <TableCell className="text-muted-foreground">{source.frequency}</TableCell>
                  <TableCell>
                    {source.keywords.length ? (
                      <div className="flex max-w-[16rem] flex-wrap gap-1">
                        {source.keywords.slice(0, 4).map((k) => (
                          <Badge key={k} variant="outline" className="font-normal">
                            {k}
                          </Badge>
                        ))}
                        {source.keywords.length > 4 && (
                          <Badge variant="outline" className="font-normal">
                            +{source.keywords.length - 4}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={enabledOverrides[source.id] ?? source.enabled}
                      disabled={busyToggle === source.id}
                      onCheckedChange={(v) => toggleEnabled(source, v)}
                      aria-label="Toggle enabled"
                    />
                  </TableCell>
                  <TableCell className="tnum text-muted-foreground">
                    {formatDate(source.lastCheckedAt)}
                  </TableCell>
                  <TableCell className="tnum text-right">{source._count?.opportunities ?? 0}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Row actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={!meta.automatable || run?.running}
                          onSelect={(e) => {
                            e.preventDefault();
                            if (meta.automatable) runNow(source);
                          }}
                        >
                          {run?.running ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Run now
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditing(source)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={busyDelete === source.id}
                          onSelect={(e) => {
                            e.preventDefault();
                            handleDelete(source);
                          }}
                        >
                          {busyDelete === source.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog — controlled, mounted only when a row is being edited. */}
      {editing && (
        <SourceForm
          key={editing.id}
          source={editing}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          trigger={<span className="hidden" />}
        />
      )}
    </>
  );
}

// Re-export the shared row type so consumers can import it from one place.
export type { SourceRow };
