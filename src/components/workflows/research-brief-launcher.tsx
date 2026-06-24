"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Fingerprint, Loader2, MapPinned, Search, ShieldCheck, UserSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  buildResearchRunbook,
  normalizeResearchBriefOptions,
  researchSubjectClueSummary,
} from "@/lib/workflows/research-brief";
import { researchBriefRunPayload } from "@/lib/workflows/usecase-actions";

type ResearchSubjectType = "unknown" | "person" | "company";
type ResearchObjective = "find-contact" | "qualify-lead" | "map-opportunity" | "verify-identity" | "general";
type ResearchDepth = "quick" | "standard" | "deep";
type Workspace = "DK" | "GLOBAL";

type WorkflowRunResponse = {
  run?: {
    id: string;
    status: string;
  };
  error?: unknown;
};

export const RESEARCH_BRIEF_STARTERS = [
  {
    id: "name-contact",
    label: "Name to contact",
    subjectType: "person",
    objective: "find-contact",
    depth: "standard",
    icon: UserSearch,
  },
  {
    id: "company-contact",
    label: "Company contact",
    subjectType: "company",
    objective: "find-contact",
    depth: "standard",
    icon: Building2,
  },
  {
    id: "clue-lookup",
    label: "Clue lookup",
    subjectType: "unknown",
    objective: "qualify-lead",
    depth: "standard",
    icon: Fingerprint,
  },
  {
    id: "opportunity-map",
    label: "Opportunity map",
    subjectType: "company",
    objective: "map-opportunity",
    depth: "deep",
    icon: MapPinned,
  },
  {
    id: "verify-match",
    label: "Verify match",
    subjectType: "unknown",
    objective: "verify-identity",
    depth: "standard",
    icon: ShieldCheck,
  },
] satisfies Array<{
  id: string;
  label: string;
  subjectType: ResearchSubjectType;
  objective: ResearchObjective;
  depth: ResearchDepth;
  icon: React.ComponentType<{ className?: string }>;
}>;

export function ResearchBriefLauncher({
  defaultSubject = "",
  subjectType = "unknown",
  objective = "qualify-lead",
  depth = "standard",
  workspace = "DK",
  accountId,
  personId,
  dealId,
  buttonLabel = "Queue brief",
}: {
  defaultSubject?: string;
  subjectType?: ResearchSubjectType;
  objective?: ResearchObjective;
  depth?: ResearchDepth;
  workspace?: Workspace;
  accountId?: string | null;
  personId?: string | null;
  dealId?: string | null;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [subject, setSubject] = React.useState(defaultSubject);
  const [selectedType, setSelectedType] = React.useState<ResearchSubjectType>(subjectType);
  const [selectedObjective, setSelectedObjective] = React.useState<ResearchObjective>(objective);
  const [selectedDepth, setSelectedDepth] = React.useState<ResearchDepth>(depth);
  const [createTasks, setCreateTasks] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const preview = React.useMemo(() => {
    const trimmed = subject.trim();
    if (trimmed.length < 2) return null;
    const normalized = normalizeResearchBriefOptions({
      subject: trimmed,
      subjectType: selectedType,
      objective: selectedObjective,
      depth: selectedDepth,
      createTasks,
    });
    return {
      normalized,
      clues: researchSubjectClueSummary(trimmed),
      runbook: buildResearchRunbook(normalized, workspace).slice(0, 3),
    };
  }, [createTasks, selectedDepth, selectedObjective, selectedType, subject, workspace]);

  React.useEffect(() => {
    setSubject(defaultSubject);
  }, [defaultSubject]);

  async function queueBrief() {
    const trimmed = subject.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          researchBriefRunPayload({
            subject: trimmed,
            subjectType: selectedType,
            objective: selectedObjective,
            depth: selectedDepth,
            createTasks,
            workspace,
            accountId,
            personId,
            dealId,
          }),
        ),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || "Could not queue research brief"));
      toast.success("Research brief queued", "Opening the linked workflow run.");
      router.push(`/workflows/runs/${data.run.id}`);
      router.refresh();
    } catch (err) {
      toast.error("Could not queue research brief", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  function applyStarter(starter: (typeof RESEARCH_BRIEF_STARTERS)[number]) {
    setSelectedType(starter.subjectType);
    setSelectedObjective(starter.objective);
    setSelectedDepth(starter.depth);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Search className="h-4 w-4 text-primary" />
          Research brief
        </div>
        <Button
          type="button"
          onClick={queueBrief}
          disabled={busy || subject.trim().length < 2}
          className="w-full sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {buttonLabel}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {RESEARCH_BRIEF_STARTERS.map((starter) => {
          const Icon = starter.icon;
          const active =
            selectedType === starter.subjectType &&
            selectedObjective === starter.objective &&
            selectedDepth === starter.depth;
          return (
            <Button
              key={starter.id}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="sm"
              className="h-auto min-h-8 justify-start whitespace-normal text-left"
              onClick={() => applyStarter(starter)}
            >
              <Icon className="h-4 w-4" />
              {starter.label}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="research-subject">Subject</Label>
          <Input
            id="research-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Name, company, domain, or clue"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={selectedType} onValueChange={(value) => setSelectedType(value as ResearchSubjectType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Unknown</SelectItem>
              <SelectItem value="person">Person</SelectItem>
              <SelectItem value="company">Company</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Goal</Label>
          <Select value={selectedObjective} onValueChange={(value) => setSelectedObjective(value as ResearchObjective)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qualify-lead">Qualify lead</SelectItem>
              <SelectItem value="find-contact">Find contact</SelectItem>
              <SelectItem value="map-opportunity">Map opportunity</SelectItem>
              <SelectItem value="verify-identity">Verify identity</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Depth</Label>
          <Select value={selectedDepth} onValueChange={(value) => setSelectedDepth(value as ResearchDepth)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quick">Quick</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="deep">Deep</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <div className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
            <Label htmlFor="research-create-tasks" className="text-xs text-muted-foreground">Tasks</Label>
            <Switch id="research-create-tasks" checked={createTasks} onCheckedChange={setCreateTasks} />
          </div>
        </div>
      </div>

      {preview ? (
        <div className="rounded-md border border-border bg-surface/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{preview.normalized.subjectType}</Badge>
            <Badge variant="outline">{preview.normalized.objective.replace("-", " ")}</Badge>
            <Badge variant="outline">{preview.normalized.depth}</Badge>
            <p className="min-w-0 truncate text-sm font-medium">{preview.normalized.subject}</p>
          </div>
          {preview.clues.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.clues.map((clue) => (
                <Badge key={`${clue.id}-${clue.value}`} variant="secondary" className="max-w-full truncate" title={clue.value}>
                  {clue.label}: {clue.value}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2">
            {preview.runbook.map((step) => (
              <div key={step.id} className="rounded-md border border-border bg-background/50 p-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{step.title}</p>
                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{step.goal}</p>
                  </div>
                  {step.routePriority?.[0] ? (
                    <Badge variant="outline" className="shrink-0">{step.routePriority[0]}</Badge>
                  ) : null}
                </div>
                {step.searchPrompts.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {step.searchPrompts.slice(0, 3).map((prompt) => (
                      <Badge key={prompt} variant="outline" className="max-w-full truncate" title={prompt}>
                        {prompt}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
