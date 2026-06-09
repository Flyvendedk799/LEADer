import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSignature } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { DraftKind } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  SUMMARY: "Summaries",
  APPLICATION: "Applications",
  PITCH: "Pitches",
  EMAIL: "Outreach emails",
  CHECKLIST: "Checklists",
  COMPARISON: "Comparisons",
  EXPLANATION: "Score explanations",
};

const KIND_ORDER: DraftKind[] = [
  "SUMMARY",
  "EXPLANATION",
  "APPLICATION",
  "PITCH",
  "EMAIL",
  "CHECKLIST",
  "COMPARISON",
];

interface DraftItem {
  id: string;
  kind: string;
  title?: string | null;
  content: string;
  createdAt: Date;
}

export function DraftViewer({ drafts }: { drafts: DraftItem[] }) {
  if (drafts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileSignature className="h-4 w-4 text-primary" />
            AI drafts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No drafts yet. Use the AI assistant to generate applications, pitches and emails.
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = new Map<string, DraftItem[]>();
  for (const d of drafts) {
    const list = grouped.get(d.kind) ?? [];
    list.push(d);
    grouped.set(d.kind, list);
  }

  const kinds = [...grouped.keys()].sort(
    (a, b) => KIND_ORDER.indexOf(a as DraftKind) - KIND_ORDER.indexOf(b as DraftKind),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileSignature className="h-4 w-4 text-primary" />
          AI drafts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {kinds.map((kind) => (
          <div key={kind} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{KIND_LABELS[kind] ?? kind}</Badge>
            </div>
            {(grouped.get(kind) ?? []).map((d) => (
              <div key={d.id} className="rounded-md border border-border bg-surface-2/50 p-3">
                {d.title && (
                  <p className="mb-1 text-sm font-medium text-foreground">{d.title}</p>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {d.content}
                </pre>
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(d.createdAt)}</p>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
