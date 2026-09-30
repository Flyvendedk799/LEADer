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

export function NewDealDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const routeWorkspace = workspaceFromRoute(pathname, searchParams);
  const queryWorkspace = searchParams.get("workspace") === "GLOBAL" ? "GLOBAL" : searchParams.get("workspace") === "DK" ? "DK" : routeWorkspace;

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [organization, setOrganization] = React.useState("");
  const [valueMin, setValueMin] = React.useState("");
  const [valueMax, setValueMax] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [applicationRoute, setApplicationRoute] = React.useState<ApplicationRoute>("UNKNOWN");
  const [workspace, setWorkspace] = React.useState<Workspace>(queryWorkspace);

  React.useEffect(() => {
    if (searchParams.get("new") === "1") {
      setWorkspace(queryWorkspace);
      setOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [queryWorkspace, searchParams, pathname, router]);

  React.useEffect(() => {
    if (!open) setWorkspace(queryWorkspace);
  }, [open, queryWorkspace]);

  function reset() {
    setTitle("");
    setSummary("");
    setUrl("");
    setOrganization("");
    setValueMin("");
    setValueMax("");
    setDeadline("");
    setCategory("");
    setApplicationRoute("UNKNOWN");
    setWorkspace(queryWorkspace);
    setError(null);
  }

  async function submit() {
    if (title.trim().length < 3) {
      toast.error("Title needs at least 3 characters");
      return;
    }
    if (valueMin !== "" && valueMax !== "" && Number(valueMin) > Number(valueMax)) {
      toast.error("Value min must be ≤ max");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let accountId: string | undefined;
      if (organization.trim()) {
        const accountRes = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: organization.trim(),
            website: url.trim(),
            workspace,
          }),
        });
        const account = await accountRes.json().catch(() => ({}));
        if (!accountRes.ok) throw new Error(account?.error || "Failed to save account");
        accountId = account.id;
      }

      const payload: Record<string, unknown> = { title: title.trim(), workspace, applicationRoute };
      if (accountId) payload.accountId = accountId;
      if (summary.trim()) payload.summary = summary.trim();
      if (url.trim()) payload.url = url.trim();
      if (category.trim()) payload.category = category.trim();
      if (valueMin !== "") payload.valueMin = Number(valueMin);
      if (valueMax !== "") payload.valueMax = Number(valueMax);
      if (deadline !== "") payload.deadline = `${deadline}T23:59:59`;

      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to create deal");
      toast.success("Deal created");
      setOpen(false);
      reset();
      if (body?.id) router.push(`/deals/${body.id}`);
      else router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create deal";
      setError(message);
      toast.error("Failed to create deal", message);
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
          New deal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>Add a lead straight into the pipeline.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nd-title">Title</Label>
            <Input id="nd-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nd-summary">Summary</Label>
            <Textarea id="nd-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What is this about?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-org">Account</Label>
              <Input id="nd-org" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Company or buyer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-url">URL</Label>
              <Input id="nd-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-min">Value min</Label>
              <Input id="nd-min" type="number" min={0} value={valueMin} onChange={(e) => setValueMin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-max">Value max</Label>
              <Input id="nd-max" type="number" min={0} value={valueMax} onChange={(e) => setValueMax(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-deadline">Deadline</Label>
              <Input id="nd-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-category">Category</Label>
              <Input id="nd-category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Application route</Label>
              <Select value={applicationRoute} onValueChange={(v) => setApplicationRoute(v as ApplicationRoute)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
