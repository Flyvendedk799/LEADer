"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getQuickDate } from "@/lib/utils";

export function NewTask({ deals }: { deals: { id: string; title: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dueDate, setDueDate] = useState("");

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <form
        className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_10rem_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          setBusy(true);
          try {
            const date = dueDate || String(data.get("dueAt") || "");
            const priority = String(data.get("priority") || "MEDIUM");
            const res = await fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: String(data.get("title")).trim(),
                dealId: data.get("dealId") || undefined,
                priority,
                dueAt: date
                  ? new Date(`${date}T17:00:00`).toISOString()
                  : undefined,
              }),
            });
            if (!res.ok) throw new Error("Task could not be saved");
            form.reset();
            setDueDate("");
            toast.success("Task added");
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("leader:counts-refresh"));
            }
            router.refresh();
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          name="title"
          aria-label="Task title"
          placeholder="What needs to happen next?"
          required
          maxLength={300}
        />
        <select
          name="dealId"
          aria-label="Link task to deal"
          className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Personal task</option>
          {deals.map((deal) => (
            <option key={deal.id} value={deal.id}>
              {deal.title}
            </option>
          ))}
        </select>
        <select
          name="priority"
          aria-label="Task priority"
          defaultValue="MEDIUM"
          className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm"
        >
          <option value="LOW">Low priority</option>
          <option value="MEDIUM">Medium priority</option>
          <option value="HIGH">High priority</option>
          <option value="URGENT">Urgent priority</option>
        </select>
        <Input
          name="dueAt"
          aria-label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <Button disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add task
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
        <span className="font-medium">Quick date:</span>
        <button
          type="button"
          onClick={() => setDueDate(getQuickDate("today"))}
          className="min-h-11 min-w-11 px-3 inline-flex items-center justify-center rounded-md border border-border bg-surface text-xs font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setDueDate(getQuickDate("tomorrow"))}
          className="min-h-11 min-w-11 px-3 inline-flex items-center justify-center rounded-md border border-border bg-surface text-xs font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => setDueDate(getQuickDate("next-week"))}
          className="min-h-11 min-w-11 px-3 inline-flex items-center justify-center rounded-md border border-border bg-surface text-xs font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          Next week
        </button>
      </div>
    </div>
  );
}
