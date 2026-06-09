"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  const time = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatDate(date)} · ${time}`;
}

export function NotesSection({
  id,
  notes,
}: {
  id: string;
  notes: { id: string; body: string; createdAt: Date }[];
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function addNote() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <StickyNote className="h-4 w-4 text-primary" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Add a note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} disabled={saving || !body.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add note
            </Button>
          </div>
        </div>

        {notes.length > 0 && (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border border-border bg-surface-2/50 p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
