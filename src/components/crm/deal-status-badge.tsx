import { Badge } from "@/components/ui/badge";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import type { DealStatus } from "@/lib/types";

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const meta = DEAL_STATUS_META[status];
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </Badge>
  );
}
