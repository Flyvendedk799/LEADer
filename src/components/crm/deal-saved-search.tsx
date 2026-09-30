"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export function DealSavedSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const filters = React.useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((value, key) => {
      if (key === "new" || !value) return;
      out[key] = value;
    });
    return out;
  }, [params]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filters }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save search");
      setName("");
      toast.success("Search saved");
      router.refresh();
    } catch (err) {
      toast.error("Could not save search", err instanceof Error ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this view"
        className="h-9 w-48"
        aria-label="Saved search name"
      />
      <Button type="submit" variant="outline" size="sm" disabled={saving || !name.trim()}>
        <Bookmark className="h-4 w-4" />
        Save search
      </Button>
    </form>
  );
}
