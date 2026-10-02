"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export function NewTask({ deals }: { deals: { id: string; title: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_10rem_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        try {
          const date = String(data.get("dueAt") || "");
          const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: String(data.get("title")).trim(),
              dealId: data.get("dealId") || undefined,
              dueAt: date
                ? new Date(`${date}T17:00:00`).toISOString()
                : undefined,
            }),
          });
          if (!res.ok) throw new Error("Task could not be saved");
          form.reset();
          toast.success("Task added");
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
      <Input name="dueAt" aria-label="Due date" type="date" />
      <Button disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add task
      </Button>
    </form>
  );
}
