import { Badge } from "@/components/ui/badge";
import { daysUntil, formatDate, relativeDeadline } from "@/lib/utils";

/** Color-coded deadline indicator: red (past/urgent) → amber → muted. */
export function DeadlinePill({ deadline }: { deadline?: Date | string | null }) {
  if (!deadline) return <Badge variant="muted">No deadline</Badge>;
  const d = daysUntil(deadline);
  const variant = d == null ? "muted" : d < 0 ? "destructive" : d <= 7 ? "warning" : d <= 30 ? "default" : "secondary";
  return (
    <Badge variant={variant} title={formatDate(deadline)}>
      {relativeDeadline(deadline)}
    </Badge>
  );
}
