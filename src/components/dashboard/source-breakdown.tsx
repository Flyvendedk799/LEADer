import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Horizontal bar list inside a Card — reusable for sources / categories / status. */
export function SourceBreakdown({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {data.map((d) => {
              const pct = max > 0 ? Math.max(4, Math.round((d.value / max) * 100)) : 0;
              return (
                <li key={d.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground" title={d.label}>
                      {d.label}
                    </span>
                    <span className="tnum shrink-0 font-medium text-muted-foreground">{d.value}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
