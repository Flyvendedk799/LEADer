import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatAccent = "default" | "success" | "warning" | "destructive" | "primary";

const ACCENT_RING: Record<StatAccent, string> = {
  default: "text-muted-foreground bg-surface-2",
  primary: "text-primary bg-primary/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  destructive: "text-destructive bg-destructive/10",
};

/** Compact metric tile: big numeric value, label, optional hint + trailing icon. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: StatAccent;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold leading-none tracking-tight">{value}</p>
          {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
              ACCENT_RING[accent],
            )}
          >
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
