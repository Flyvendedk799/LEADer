"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITY_STATUSES } from "@/lib/types";
import type { OpportunityStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/display";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: OpportunityStatus;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState<OpportunityStatus>(status);
  const [saving, setSaving] = React.useState(false);

  async function handleChange(next: string) {
    const status = next as OpportunityStatus;
    const previous = value;
    setValue(status);
    setSaving(true);
    try {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Status updated");
      router.refresh();
    } catch {
      setValue(previous);
      toast.error("Couldn't update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPPORTUNITY_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <span className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[s].dot)} />
              {STATUS_META[s].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
