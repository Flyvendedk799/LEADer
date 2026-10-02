"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type EditableDeal = {
  id: string;
  title: string;
  summary: string | null;
  nextAction: string | null;
  valueMin: number | null;
  valueMax: number | null;
  currency: string | null;
  deadline: Date | string | null;
  url: string | null;
};
export function EditDeal({ deal }: { deal: EditableDeal }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
          Edit deal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit deal</DialogTitle>
          <DialogDescription>
            Keep the brief, value, and next action current.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const min = data.get("valueMin");
            const max = data.get("valueMax");
            if (min && max && Number(min) > Number(max)) {
              setError(
                "Minimum value must be less than or equal to maximum value.",
              );
              return;
            }
            setBusy(true);
            setError("");
            try {
              const date = String(data.get("deadline") || "");
              const res = await fetch(`/api/deals/${deal.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: String(data.get("title")).trim(),
                  summary: data.get("summary"),
                  nextAction: data.get("nextAction"),
                  url: data.get("url"),
                  currency: data.get("currency"),
                  valueMin: min ? Number(min) : null,
                  valueMax: max ? Number(max) : null,
                  deadline: date
                    ? new Date(`${date}T23:59:59`).toISOString()
                    : null,
                }),
              });
              if (!res.ok)
                throw new Error(
                  "Your changes could not be saved. Check the fields and try again.",
                );
              toast.success("Deal updated");
              setOpen(false);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              name="title"
              required
              minLength={3}
              defaultValue={deal.title}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-summary">Brief</Label>
            <Textarea
              id="edit-summary"
              name="summary"
              rows={4}
              defaultValue={deal.summary || ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-next">Next action</Label>
            <Input
              id="edit-next"
              name="nextAction"
              defaultValue={deal.nextAction || ""}
              placeholder="e.g. Send a short introduction to the founder"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["valueMin", "valueMax"].map((field) => (
              <div className="space-y-1.5" key={field}>
                <Label htmlFor={`edit-${field}`}>
                  {field === "valueMin" ? "Minimum value" : "Maximum value"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  id={`edit-${field}`}
                  name={field}
                  defaultValue={deal[field as "valueMin" | "valueMax"] ?? ""}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-currency">Currency</Label>
              <select
                id="edit-currency"
                name="currency"
                defaultValue={deal.currency || "DKK"}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {Array.from(
                  new Set([
                    deal.currency || "DKK",
                    "DKK",
                    "EUR",
                    "USD",
                    "GBP",
                    "SEK",
                    "NOK",
                  ]),
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-deadline">Deadline</Label>
              <Input
                id="edit-deadline"
                name="deadline"
                type="date"
                defaultValue={
                  deal.deadline
                    ? new Date(deal.deadline).toLocaleDateString("en-CA")
                    : ""
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-url">Source URL</Label>
            <Input
              id="edit-url"
              name="url"
              type="url"
              defaultValue={deal.url || ""}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
