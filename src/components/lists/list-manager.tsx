"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ListChecks, Loader2, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: { items: number };
}

const COLOR_SWATCHES = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
];

export function ListManager({ lists }: { lists: ListSummary[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<string>(COLOR_SWATCHES[0]);
  const [creating, setCreating] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        }),
      });
      if (!res.ok) throw new Error("Failed to create list");
      setName("");
      setDescription("");
      setColor(COLOR_SWATCHES[0]);
      toast.success("List created", name.trim());
      router.refresh();
    } catch {
      setError("Could not create the list. Please try again.");
      toast.error("Could not create the list", "Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(list: ListSummary) {
    if (!confirm(`Delete "${list.name}" and its items?`)) return;
    setDeletingId(list.id);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete list");
      toast.success("List deleted", list.name);
      router.refresh();
    } catch {
      setError("Could not delete the list. Please try again.");
      toast.error("Could not delete the list", "Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-muted-foreground" />
            New list
          </CardTitle>
          <CardDescription>
            Group opportunities into a working set you can revisit and export.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="list-name">Name</Label>
                <Input
                  id="list-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q3 grant shortlist"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex h-9 items-center gap-2">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      className={cn(
                        "h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition-all",
                        color === c ? "ring-2 ring-ring" : "opacity-70 hover:opacity-100",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-description">Description</Label>
              <Textarea
                id="list-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — what belongs in this list?"
                className="min-h-[60px]"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create list
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {lists.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Card key={list.id} className="group relative">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: list.color ?? "var(--muted-foreground)" }}
                    />
                    <Link
                      href={`/lists#list-${list.id}`}
                      className="truncate hover:underline"
                    >
                      {list.name}
                    </Link>
                  </CardTitle>
                  {list.description && (
                    <CardDescription className="mt-1 line-clamp-2">
                      {list.description}
                    </CardDescription>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      {deletingId === list.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreVertical className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(list)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete list
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <p className="tnum flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ListChecks className="h-4 w-4" />
                  {list._count.items} {list._count.items === 1 ? "opportunity" : "opportunities"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
