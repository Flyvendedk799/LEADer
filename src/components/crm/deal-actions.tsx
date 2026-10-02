"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { DEAL_STATUSES, type DealStatus, type TouchpointKind } from "@/lib/types";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }
  return data;
}

export function DealActions({
  dealId,
  accountId,
  status,
}: {
  dealId: string;
  accountId: string | null;
  status: DealStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(status);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [personName, setPersonName] = React.useState("");
  const [personEmail, setPersonEmail] = React.useState("");
  const [touchKind, setTouchKind] = React.useState<TouchpointKind>("NOTE");
  const [touchSummary, setTouchSummary] = React.useState("");

  React.useEffect(() => setCurrent(status), [status]);

  async function changeStatus(next: DealStatus) {
    const previous = current;
    setCurrent(next);
    setBusy("status");
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Status updated", DEAL_STATUS_META[next].label);
      router.refresh();
    } catch (err) {
      setCurrent(previous);
      toast.error("Couldn't update status", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy("task");
    try {
      await postJson("/api/tasks", {
        dealId,
        accountId: accountId ?? undefined,
        title: taskTitle.trim(),
        dueAt: taskDue ? `${taskDue}T23:59:59` : undefined,
      });
      setTaskTitle("");
      setTaskDue("");
      toast.success("Task added");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't add task", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!personName.trim() && !personEmail.trim()) return;
    setBusy("person");
    try {
      await postJson("/api/people", {
        dealId,
        accountId: accountId ?? undefined,
        name: personName.trim() || undefined,
        email: personEmail.trim() || undefined,
      });
      setPersonName("");
      setPersonEmail("");
      toast.success("Person added");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't add person", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function addTouchpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!touchSummary.trim()) return;
    setBusy("touch");
    try {
      await postJson("/api/touchpoints", {
        dealId,
        accountId: accountId ?? undefined,
        kind: touchKind,
        summary: touchSummary.trim(),
      });
      setTouchSummary("");
      toast.success("Touchpoint logged");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't log touchpoint", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Deal Actions</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="task">Task</TabsTrigger>
            <TabsTrigger value="person">Person</TabsTrigger>
            <TabsTrigger value="touch">Log</TabsTrigger>
          </TabsList>
          
          <TabsContent value="status" className="space-y-2">
            <Label className="text-xs text-muted-foreground">Change deal status</Label>
            <Select value={current} onValueChange={(value) => changeStatus(value as DealStatus)} disabled={busy === "status"}>
              <SelectTrigger aria-label="Deal status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEAL_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>{DEAL_STATUS_META[value].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsContent>

          <TabsContent value="task">
            <form onSubmit={addTask} className="space-y-3">
              <div className="space-y-2">
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Next step description" />
                <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Task due date" />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={busy === "task" || !taskTitle.trim()}>
                {busy === "task" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save task
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="person">
            <form onSubmit={addPerson} className="space-y-3">
              <div className="space-y-2">
                <Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Contact Name" />
                <Input type="email" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} placeholder="Email Address" />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={busy === "person" || (!personName.trim() && !personEmail.trim())}>
                {busy === "person" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save person
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="touch">
            <form onSubmit={addTouchpoint} className="space-y-3">
              <div className="space-y-2">
                <Select value={touchKind} onValueChange={(value) => setTouchKind(value as TouchpointKind)}>
                  <SelectTrigger aria-label="Touchpoint kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["CALL", "EMAIL", "MEETING", "NOTE", "MESSAGE", "OTHER"] as TouchpointKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>{kind.charAt(0) + kind.slice(1).toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="sr-only" htmlFor="touch-summary">Summary</Label>
                <Textarea id="touch-summary" value={touchSummary} onChange={(e) => setTouchSummary(e.target.value)} placeholder="What happened?" className="min-h-[80px]" />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={busy === "touch" || !touchSummary.trim()}>
                {busy === "touch" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save touchpoint
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
