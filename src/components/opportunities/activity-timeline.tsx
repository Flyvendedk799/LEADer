import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity as ActivityIcon } from "lucide-react";
import { formatDate } from "@/lib/utils";

function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  const time = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatDate(date)} · ${time}`;
}

export function ActivityTimeline({
  activities,
}: {
  activities: { type: string; message: string; createdAt: Date }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ActivityIcon className="h-4 w-4 text-primary" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-border pl-5">
            {activities.map((a, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                <p className="text-sm text-foreground">{a.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.type.toLowerCase().replace(/_/g, " ")} · {formatDateTime(a.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
