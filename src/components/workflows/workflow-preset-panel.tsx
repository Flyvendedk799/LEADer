"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Database, Edit3, ExternalLink, Loader2, Plus, PlayCircle, Save, Sparkles, Target, TimerReset, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn, formatDate } from "@/lib/utils";

type WorkflowPlaybook = "daily-sweep" | "pipeline-rescue" | "candidate-harvest" | "operating-day";
type Workspace = "DK" | "GLOBAL";

type WorkflowRunOptions = {
  dailySweep?: {
    includeSources?: boolean;
    includeAlerts?: boolean;
  };
  candidateHarvest?: {
    minScore?: number;
    limit?: number;
  };
  pipelineRescue?: {
    staleDays?: number;
    deadlineDays?: number;
    limit?: number;
  };
  operatingDay?: {
    dailySweep?: boolean;
    candidateHarvest?: boolean;
    pipelineRescue?: boolean;
  };
};

type WorkflowRunPreview = {
  phases: {
    dailySweep: boolean;
    candidateHarvest: boolean;
    pipelineRescue: boolean;
  };
  dailySweep: {
    includeSources: boolean;
    dueSources: number;
  };
  candidateHarvest: {
    willReview: number;
  };
  pipelineRescue: {
    staleDeals: number;
    deadlineDeals: number;
    willReview: number;
  };
};

export type WorkflowPresetPanelItem = {
  id: string;
  name: string;
  description: string | null;
  playbook: WorkflowPlaybook;
  workspace: Workspace;
  options: WorkflowRunOptions;
  optionSummary: string;
  pinned: boolean;
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  scheduleNextRunAt: string | null;
  scheduleSummary: string;
  lastScheduledAt: string | null;
  lastQueuedAt: string | null;
  updatedAt: string;
  activeRun: {
    id: string;
    status: string;
    trigger: string;
    createdAt: string;
  } | null;
  recentEvents: Array<{
    id: string;
    runId: string | null;
    eventType: string;
    reason: string | null;
    message: string;
    createdAt: string;
  }>;
  preview: WorkflowRunPreview;
};

type FormState = {
  name: string;
  description: string;
  playbook: WorkflowPlaybook;
  workspace: Workspace;
  pinned: boolean;
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  scheduleNextRunAt: string;
  daySweep: boolean;
  dayHarvest: boolean;
  dayRescue: boolean;
  includeSources: boolean;
  includeAlerts: boolean;
  minScore: number;
  candidateLimit: number;
  staleDays: number;
  deadlineDays: number;
  pipelineLimit: number;
};

type WorkflowRunResponse = {
  run?: {
    id: string;
    status: string;
  };
  error?: unknown;
};

const defaultForm: FormState = {
  name: "",
  description: "",
  playbook: "operating-day",
  workspace: "DK",
  pinned: false,
  scheduleEnabled: false,
  scheduleIntervalHours: 24,
  scheduleNextRunAt: "",
  daySweep: true,
  dayHarvest: true,
  dayRescue: true,
  includeSources: true,
  includeAlerts: true,
  minScore: 70,
  candidateLimit: 6,
  staleDays: 14,
  deadlineDays: 7,
  pipelineLimit: 12,
};

function playbookLabel(playbook: WorkflowPlaybook) {
  return playbook
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultNextRunLocal() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
}

function formFromPreset(preset?: WorkflowPresetPanelItem | null): FormState {
  if (!preset) return defaultForm;
  return {
    name: preset.name,
    description: preset.description ?? "",
    playbook: preset.playbook,
    workspace: preset.workspace,
    pinned: preset.pinned,
    scheduleEnabled: preset.scheduleEnabled,
    scheduleIntervalHours: preset.scheduleIntervalHours,
    scheduleNextRunAt: toDateTimeLocal(preset.scheduleNextRunAt),
    daySweep: preset.options.operatingDay?.dailySweep !== false,
    dayHarvest: preset.options.operatingDay?.candidateHarvest !== false,
    dayRescue: preset.options.operatingDay?.pipelineRescue !== false,
    includeSources: preset.options.dailySweep?.includeSources !== false,
    includeAlerts: preset.options.dailySweep?.includeAlerts !== false,
    minScore: preset.options.candidateHarvest?.minScore ?? 70,
    candidateLimit: preset.options.candidateHarvest?.limit ?? 6,
    staleDays: preset.options.pipelineRescue?.staleDays ?? 14,
    deadlineDays: preset.options.pipelineRescue?.deadlineDays ?? 7,
    pipelineLimit: preset.options.pipelineRescue?.limit ?? 12,
  };
}

function payloadFromForm(form: FormState) {
  const options: WorkflowRunOptions = {};
  if (form.playbook === "operating-day") {
    options.operatingDay = {
      dailySweep: form.daySweep,
      candidateHarvest: form.dayHarvest,
      pipelineRescue: form.dayRescue,
    };
  }
  if (form.playbook === "daily-sweep" || form.playbook === "operating-day") {
    options.dailySweep = {
      includeSources: form.includeSources,
      includeAlerts: form.includeAlerts,
    };
  }
  if (form.playbook === "candidate-harvest" || form.playbook === "operating-day") {
    options.candidateHarvest = {
      minScore: form.minScore,
      limit: form.candidateLimit,
    };
  }
  if (form.playbook === "pipeline-rescue" || form.playbook === "operating-day") {
    options.pipelineRescue = {
      staleDays: form.staleDays,
      deadlineDays: form.deadlineDays,
      limit: form.pipelineLimit,
    };
  }

  return {
    name: form.name,
    description: form.description || null,
    playbook: form.playbook,
    workspace: form.workspace,
    pinned: form.pinned,
    scheduleEnabled: form.scheduleEnabled,
    scheduleIntervalHours: form.scheduleIntervalHours,
    scheduleNextRunAt: form.scheduleEnabled && form.scheduleNextRunAt
      ? new Date(form.scheduleNextRunAt).toISOString()
      : null,
    options,
  };
}

function iconForPlaybook(playbook: WorkflowPlaybook) {
  const className = "h-4 w-4";
  if (playbook === "daily-sweep") return <Database className={className} />;
  if (playbook === "candidate-harvest") return <Target className={className} />;
  if (playbook === "pipeline-rescue") return <TimerReset className={className} />;
  return <Sparkles className={className} />;
}

function scheduleLabel(preset: WorkflowPresetPanelItem) {
  if (!preset.scheduleEnabled) return "Manual";
  const cadence = preset.scheduleIntervalHours === 24
    ? "Daily"
    : preset.scheduleIntervalHours % 24 === 0
      ? `Every ${preset.scheduleIntervalHours / 24}d`
      : `Every ${preset.scheduleIntervalHours}h`;
  return preset.scheduleNextRunAt ? `${cadence} · next ${formatDate(preset.scheduleNextRunAt)}` : `${cadence} · due now`;
}

function eventVariant(eventType: string) {
  if (eventType === "QUEUED") return "success";
  if (eventType === "ERROR") return "warning";
  return "outline";
}

export function WorkflowPresetPanel({ presets }: { presets: WorkflowPresetPanelItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkflowPresetPanelItem | null>(null);
  const [form, setForm] = React.useState<FormState>(defaultForm);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...defaultForm, name: "New operating mode", scheduleNextRunAt: defaultNextRunLocal() });
    setOpen(true);
  }

  function openEdit(preset: WorkflowPresetPanelItem) {
    setEditing(preset);
    setForm(formFromPreset(preset));
    setOpen(true);
  }

  async function savePreset() {
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/workflows/presets/${editing.id}` : "/api/workflows/presets", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(form)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.preset) throw new Error(String(data?.error || "Could not save preset"));
      toast.success(editing ? "Workflow preset updated" : "Workflow preset created");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Could not save preset", err instanceof Error ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  async function queuePreset(preset: WorkflowPresetPanelItem) {
    setBusyId(`queue-${preset.id}`);
    try {
      const res = await fetch(`/api/workflows/presets/${preset.id}/queue`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || "Could not queue preset"));
      toast.success(`${preset.name} queued`, "It will keep running in the background.");
      router.refresh();
    } catch (err) {
      toast.error("Could not queue preset", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePreset(preset: WorkflowPresetPanelItem) {
    if (!window.confirm(`Delete ${preset.name}?`)) return;
    setBusyId(`delete-${preset.id}`);
    try {
      const res = await fetch(`/api/workflows/presets/${preset.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(String(data?.error || "Could not delete preset"));
      toast.success("Workflow preset deleted");
      router.refresh();
    } catch (err) {
      toast.error("Could not delete preset", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  const saveDisabled =
    saving ||
    form.name.trim().length < 2 ||
    (form.playbook === "operating-day" && !form.daySweep && !form.dayHarvest && !form.dayRescue);
  const showDaily = form.playbook === "daily-sweep" || form.playbook === "operating-day";
  const showHarvest = form.playbook === "candidate-harvest" || form.playbook === "operating-day";
  const showRescue = form.playbook === "pipeline-rescue" || form.playbook === "operating-day";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New preset
        </Button>
      </div>

      {presets.length ? (
        <div className="space-y-2">
          {presets.map((preset) => {
            const queueBusy = busyId === `queue-${preset.id}`;
            const deleteBusy = busyId === `delete-${preset.id}`;
            return (
              <div
                key={preset.id}
                className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 xl:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      {iconForPlaybook(preset.playbook)}
                    </span>
                    <p className="truncate text-sm font-medium">{preset.name}</p>
                    <Badge variant="outline">{playbookLabel(preset.playbook)}</Badge>
                    <Badge variant="outline">{preset.workspace}</Badge>
                    {preset.pinned ? <Badge variant="secondary">pinned</Badge> : null}
                    {preset.scheduleEnabled ? <Badge variant="secondary">scheduled</Badge> : null}
                    {preset.activeRun ? <Badge variant="secondary">active</Badge> : null}
                  </div>
                  {preset.description ? <p className="text-xs text-muted-foreground">{preset.description}</p> : null}
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {preset.optionSummary ? <span>{preset.optionSummary}</span> : null}
                    <span>{scheduleLabel(preset)}</span>
                    <span>{preset.lastQueuedAt ? `Queued ${formatDate(preset.lastQueuedAt)}` : `Updated ${formatDate(preset.updatedAt)}`}</span>
                  </div>
                  {preset.activeRun ? (
                    <Link
                      href={`/workflows/runs/${preset.activeRun.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {preset.activeRun.trigger}: {preset.activeRun.status.toLowerCase()} since {formatDate(preset.activeRun.createdAt)}
                    </Link>
                  ) : null}
                  {preset.recentEvents.length ? (
                    <div className="space-y-1 rounded-md border border-border bg-background/40 p-2">
                      {preset.recentEvents.slice(0, 2).map((event) => {
                        const content = (
                          <>
                            <Badge variant={eventVariant(event.eventType)}>{event.eventType.toLowerCase()}</Badge>
                            {event.reason ? <Badge variant="outline">{event.reason.replace(/_/g, " ")}</Badge> : null}
                            <span className="truncate">{event.message}</span>
                            <span className="whitespace-nowrap text-muted-foreground">{formatDate(event.createdAt)}</span>
                          </>
                        );
                        return event.runId ? (
                          <Link
                            key={event.id}
                            href={`/workflows/runs/${event.runId}`}
                            className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] hover:text-primary"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div key={event.id} className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-4">
                    <PreviewStat
                      label="Sources"
                      value={preset.preview.dailySweep.dueSources}
                      muted={!preset.preview.phases.dailySweep || !preset.preview.dailySweep.includeSources}
                    />
                    <PreviewStat
                      label="Candidates"
                      value={preset.preview.candidateHarvest.willReview}
                      muted={!preset.preview.phases.candidateHarvest}
                    />
                    <PreviewStat
                      label="Stale"
                      value={preset.preview.pipelineRescue.staleDeals}
                      muted={!preset.preview.phases.pipelineRescue}
                    />
                    <PreviewStat
                      label="Deadlines"
                      value={preset.preview.pipelineRescue.deadlineDeals}
                      muted={!preset.preview.phases.pipelineRescue}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={Boolean(busyId)} onClick={() => openEdit(preset)}>
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button type="button" size="sm" disabled={Boolean(busyId)} onClick={() => queuePreset(preset)}>
                    {queueBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Queue
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    disabled={Boolean(busyId)}
                    onClick={() => deletePreset(preset)}
                    aria-label="Delete preset"
                    title="Delete preset"
                  >
                    {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">No workflow presets yet.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit workflow preset" : "New workflow preset"}</DialogTitle>
            <DialogDescription>Save a playbook configuration for repeat runs.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_8rem]">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
              </Field>
              <Field label="Playbook">
                <Select value={form.playbook} onValueChange={(value) => update("playbook", value as WorkflowPlaybook)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operating-day">Operating day</SelectItem>
                    <SelectItem value="daily-sweep">Daily sweep</SelectItem>
                    <SelectItem value="candidate-harvest">Candidate harvest</SelectItem>
                    <SelectItem value="pipeline-rescue">Pipeline rescue</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Workspace">
                <Select value={form.workspace} onValueChange={(value) => update("workspace", value as Workspace)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DK">DK</SelectItem>
                    <SelectItem value="GLOBAL">Global</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Description">
              <Textarea value={form.description} rows={2} onChange={(e) => update("description", e.target.value)} />
            </Field>

            <div className="grid gap-2 sm:grid-cols-4">
              <SwitchControl id="preset-pinned" label="Pinned" checked={form.pinned} onCheckedChange={(value) => update("pinned", value)} />
              <SwitchControl id="preset-schedule" label="Schedule" checked={form.scheduleEnabled} onCheckedChange={(value) => update("scheduleEnabled", value)} />
              {form.playbook === "operating-day" ? (
                <>
                  <SwitchControl id="preset-sweep" label="Sweep" checked={form.daySweep} onCheckedChange={(value) => update("daySweep", value)} />
                  <SwitchControl id="preset-harvest" label="Harvest" checked={form.dayHarvest} onCheckedChange={(value) => update("dayHarvest", value)} />
                  <SwitchControl id="preset-rescue" label="Rescue" checked={form.dayRescue} onCheckedChange={(value) => update("dayRescue", value)} />
                </>
              ) : null}
            </div>

            {form.scheduleEnabled ? (
              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <NumberField label="Every hours" value={form.scheduleIntervalHours} min={1} max={720} onChange={(value) => update("scheduleIntervalHours", value)} />
                <Field label="Next run">
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="datetime-local"
                      value={form.scheduleNextRunAt}
                      onChange={(event) => update("scheduleNextRunAt", event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </Field>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {showDaily ? (
                <>
                  <SwitchControl id="preset-sources" label="Sources" checked={form.includeSources} onCheckedChange={(value) => update("includeSources", value)} disabled={form.playbook === "operating-day" && !form.daySweep} />
                  <SwitchControl id="preset-alerts" label="Alerts" checked={form.includeAlerts} onCheckedChange={(value) => update("includeAlerts", value)} disabled={form.playbook === "operating-day" && !form.daySweep} />
                </>
              ) : null}
              {showHarvest ? (
                <>
                  <NumberField label="Min score" value={form.minScore} min={0} max={100} onChange={(value) => update("minScore", value)} disabled={form.playbook === "operating-day" && !form.dayHarvest} />
                  <NumberField label="Candidates" value={form.candidateLimit} min={1} max={20} onChange={(value) => update("candidateLimit", value)} disabled={form.playbook === "operating-day" && !form.dayHarvest} />
                </>
              ) : null}
              {showRescue ? (
                <>
                  <NumberField label="Stale days" value={form.staleDays} min={1} max={90} onChange={(value) => update("staleDays", value)} disabled={form.playbook === "operating-day" && !form.dayRescue} />
                  <NumberField label="Deadline days" value={form.deadlineDays} min={1} max={60} onChange={(value) => update("deadlineDays", value)} disabled={form.playbook === "operating-day" && !form.dayRescue} />
                  <NumberField label="Deal limit" value={form.pipelineLimit} min={1} max={50} onChange={(value) => update("pipelineLimit", value)} disabled={form.playbook === "operating-day" && !form.dayRescue} />
                </>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={saveDisabled} onClick={savePreset}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-background/50 px-2.5 py-2", muted && "opacity-45")}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SwitchControl({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
      <Label htmlFor={id} className={cn("text-sm", disabled && "text-muted-foreground")}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
      />
    </Field>
  );
}
