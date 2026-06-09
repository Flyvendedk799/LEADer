import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { ScoreBadge } from "@/components/shared/score-badge";

/** Upcoming deadlines list — each row links to the opportunity detail. */
export function DeadlinesPanel({
  items,
}: {
  items: { id: string; title: string; deadline: string; matchScore: number | null }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Upcoming deadlines</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="first:pt-0 last:pb-0 py-2.5">
                <Link
                  href={`/opportunities/${item.id}`}
                  className="group flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ScoreBadge score={item.matchScore} size="sm" />
                    <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">
                      {item.title}
                    </span>
                  </div>
                  <DeadlinePill deadline={item.deadline} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
