"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { ApplicationRoute, Workspace } from "@/lib/types";
import { workspaceFromRoute } from "@/lib/workspace-context";

export function NewOpportunityDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const routeWorkspace = workspaceFromRoute(pathname, searchParams);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [organization, setOrganization] = React.useState("");
  const [budgetMin, setBudgetMin] = React.useState("");
  const [budgetMax, setBudgetMax] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [applicationRoute, setApplicationRoute] = React.useState<ApplicationRoute>("UNKNOWN");
  const [workspace, setWorkspace] = React.useState<Workspace>(routeWorkspace);

  // Open automatically when arriving with ?new=1 (e.g. from the command palette),
  // then strip the param so a refresh doesn't reopen the dialog.
  React.useEffect(() => {
    if (searchParams.get("new") === "1") {
      setWorkspace(routeWorkspace);
      setOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [routeWorkspace, searchParams, pathname, router]);

  React.useEffect(() => {
    if (!open) setWorkspace(routeWorkspace);
  }, [open, routeWorkspace]);

  function reset() {
    setTitle("");
    setDescription("");
    setUrl("");
    setOrganization("");
    setBudgetMin("");
    setBudgetMax("");
    setDeadline("");
    setCategory("");
    setApplicationRoute("UNKNOWN");
    setWorkspace(routeWorkspace);
    setError(null);
  }

  async function submit() {
    if (budgetMin !== "" && budgetMax !== "" && Number(budgetMin) > Number(budgetMax)) {
      toast.error("Budget min must be ≤ max");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      title,
      workspace,
      applicationRoute,
    };
    if (description.trim()) payload.description = description.trim();
    if (url.trim()) payload.url = url.trim();
    if (organization.trim()) payload.organization = organization.trim();
    if (category.trim()) payload.category = category.trim();
    if (budgetMin !== "") payload.budgetMin = Number(budgetMin);
    if (budgetMax !== "") payload.budgetMax = Number(budgetMax);
    // Send end-of-day local so the date doesn't shift earlier when parsed as UTC.
    if (deadline !== "") payload.deadline = `${deadline}T23:59:59`;

    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error((msg as { error?: string }).error || "Failed to create opportunity");
      }
      toast.success("Opportunity created");
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create opportunity";
      setError(message);
      toast.error("Failed to create opportunity", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New opportunity
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New opportunity</DialogTitle>
          <DialogDescription>Manually add a lead to your pipeline.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="no-title">Title</Label>
            <Input
              id="no-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Opportunity title"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="no-description">Description</Label>
            <Textarea
              id="no-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this about?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="no-org">Organization</Label>
              <Input
                id="no-org"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="no-url">URL</Label>
              <Input
                id="no-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="no-budget-min">Budget min (DKK)</Label>
              <Input
                id="no-budget-min"
                type="number"
                min={0}
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="no-budget-max">Budget max (DKK)</Label>
              <Input
                id="no-budget-max"
                type="number"
                min={0}
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="no-deadline">Deadline</Label>
              <Input
                id="no-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="no-category">Category</Label>
              <Input
                id="no-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Application route</Label>
              <Select
                value={applicationRoute}
                onValueChange={(v) => setApplicationRoute(v as ApplicationRoute)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">Direct</SelectItem>
                  <SelectItem value="APPLICATION">Application</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Workspace</Label>
              <Select value={workspace} onValueChange={(v) => setWorkspace(v as Workspace)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DK">Denmark</SelectItem>
                  <SelectItem value="GLOBAL">International</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={saving || title.trim().length < 3}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
