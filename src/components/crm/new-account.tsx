"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
export function NewAccount({ workspace }: { workspace: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            Keep a company or relationship on your radar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const res = await fetch("/api/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: String(form.get("name")).trim(),
                  website: form.get("website") || undefined,
                  description: form.get("description") || undefined,
                  workspace,
                }),
              });
              const data = await res.json();
              if (!res.ok)
                throw new Error(
                  typeof data.error === "string"
                    ? data.error
                    : "Account could not be saved",
                );
              setOpen(false);
              toast.success("Account saved");
              router.push(`/accounts/${data.id}`);
              router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Company or account name</Label>
            <Input id="account-name" name="name" required minLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-website">Website</Label>
            <Input
              id="account-website"
              name="website"
              type="url"
              placeholder="https://"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-description">Notes</Label>
            <Textarea
              id="account-description"
              name="description"
              placeholder="What do they do? How can you help?"
            />
          </div>
          <Button disabled={busy} className="w-full">
            {busy ? "Saving…" : "Save account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
