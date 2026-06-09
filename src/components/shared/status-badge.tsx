import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/display";
import type { OpportunityStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: OpportunityStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.NEW;
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}
