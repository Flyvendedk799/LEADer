"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Sparkles,
  ClipboardPaste,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Bookmark,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScoreBadge } from "@/components/shared/score-badge";
import { toast } from "@/hooks/use-toast";
import { formatBudget, formatDate } from "@/lib/utils";
import type { AiExtractResult, Workspace } from "@/lib/types";

export interface CommunityImportRow {
  id: string;
  groupName: string | null;
  author: string | null;
  status: string;
  opportunityId: string | null;
  createdAt: string | Date;
}

type ImportResponse = {
  import: { id: string; status: string };
  extracted: AiExtractResult | null;
};

export function CommunityImportForm({
  recentImports = [],
}: {
  recentImports?: CommunityImportRow[];
}) {
  const router = useRouter();

  const [groupName, setGroupName] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [postDate, setPostDate] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [content, setContent] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [workspace, setWorkspace] = React.useState<Workspace>("DK");
  const [autoExtract, setAutoExtract] = React.useState(true);

  const [submitting, setSubmitting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [importId, setImportId] = React.useState<string | null>(null);
  const [extracted, setExtracted] = React.useState<AiExtractResult | null>(null);

  const resetPreview = () => {
    setImportId(null);
    setExtracted(null);
    setError(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setExtracted(null);
    setImportId(null);
    try {
      const res = await fetch("/api/import/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupName: groupName || undefined,
          author: author || undefined,
          postDate: postDate || undefined,
          url: url || undefined,
          content,
          notes: notes || undefined,
          workspace,
          autoExtract,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : "Could not save import.";
        setError(message);
        toast.error("Could not save import", message);
        return;
      }
      const payload = data as ImportResponse;
      setImportId(payload.import.id);
      setExtracted(payload.extracted);
      toast.success(
        "Import saved",
        payload.extracted ? "AI extracted a candidate lead." : "Saved without auto-extract.",
      );
      router.refresh();
    } catch {
      setError("Network error — could not reach the server.");
      toast.error("Network error", "Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!importId) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/import/community", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: importId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.opportunityId) {
        const message =
          typeof data?.error === "string" ? data.error : "Could not create opportunity.";
        setError(message);
        toast.error("Could not create opportunity", message);
        return;
      }
      // Clear the paste fields and preview state so the same post can't be
      // accidentally re-submitted as a duplicate.
      setGroupName("");
      setAuthor("");
      setPostDate("");
      setUrl("");
      setContent("");
      setNotes("");
      setExtracted(null);
      setImportId(null);
      toast.success("Imported", "Opportunity created");
      router.push(`/opportunities/${data.opportunityId}`);
    } catch {
      setError("Network error — could not reach the server.");
      toast.error("Network error", "Could not reach the server.");
    } finally {
      setConfirming(false);
    }
  }

  const hasExtracted = importId != null && extracted != null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* LEFT — paste form + extraction preview */}
      <div className="flex flex-col gap-6">
        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-primary" />
                Paste a post
              </CardTitle>
              <CardDescription>
                Copy the text of a post you can legitimately see, then add a little context. AI
                proposes a lead; you confirm it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="groupName">Group / community</Label>
                  <Input
                    id="groupName"
                    placeholder="e.g. Danish Startup Founders"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author">Author</Label>
                  <Input
                    id="author"
                    placeholder="Who posted it"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postDate">Post date</Label>
                  <Input
                    id="postDate"
                    type="date"
                    value={postDate}
                    onChange={(e) => setPostDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="url">Post URL</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="content">Post content</Label>
                <Textarea
                  id="content"
                  required
                  placeholder="Paste the full text of the post here…"
                  className="min-h-[220px] resize-y"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (importId) resetPreview();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Paste only content you are entitled to view. LEADer never reads the group for you.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Your notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Anything you want to remember about this lead (optional)"
                  className="min-h-[72px] resize-y"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <Label htmlFor="workspace">Workspace</Label>
                  <Select value={workspace} onValueChange={(v) => setWorkspace(v as Workspace)}>
                    <SelectTrigger id="workspace" className="w-40">
                      <SelectValue placeholder="Workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DK">Denmark</SelectItem>
                      <SelectItem value="GLOBAL">International</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
                  <Switch
                    id="autoExtract"
                    checked={autoExtract}
                    onCheckedChange={setAutoExtract}
                  />
                  <Label htmlFor="autoExtract" className="flex items-center gap-1.5 text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Auto-extract with AI
                  </Label>
                </div>
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button type="submit" disabled={submitting || content.trim().length < 10}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Extracting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Save &amp; extract
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Extraction preview */}
        {hasExtracted && extracted && (
          <Card className="border-primary/30">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI candidate lead
                  </CardTitle>
                  <CardDescription>
                    Review what the AI pulled out, then create the opportunity.
                  </CardDescription>
                </div>
                <ScoreBadge score={null} size="md" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Title</p>
                <p className="text-sm font-medium">
                  {extracted.title?.trim() || "Untitled opportunity"}
                </p>
              </div>

              {extracted.description && (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Summary</p>
                  <p className="text-sm text-muted-foreground">{extracted.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Budget</p>
                  <p className="tnum text-sm">
                    {formatBudget(extracted.budgetMin, extracted.budgetMax, extracted.currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Deadline</p>
                  <p className="tnum text-sm">
                    {extracted.deadline ? formatDate(extracted.deadline) : "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Organization
                  </p>
                  <p className="text-sm">{extracted.organization || groupName || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Application
                  </p>
                  <p className="text-sm">{extracted.applicationRoute || "UNKNOWN"}</p>
                </div>
              </div>

              {extracted.requirements && extracted.requirements.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Requirements
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {extracted.requirements.map((r, i) => (
                      <Badge key={i} variant="secondary">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={handleConfirm} disabled={confirming} variant="success">
                {confirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Confirm &amp; create opportunity
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {importId && !hasExtracted && (
          <Card>
            <CardContent className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              Saved without auto-extract. Turn on “Auto-extract with AI” and save again to generate a
              candidate lead.
            </CardContent>
          </Card>
        )}

        {recentImports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent imports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentImports.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.groupName || "Untitled group"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.author ? `${row.author} · ` : ""}
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        row.status === "CONFIRMED"
                          ? "success"
                          : row.status === "EXTRACTED"
                            ? "default"
                            : row.status === "DISCARDED"
                              ? "muted"
                              : "secondary"
                      }
                    >
                      {row.status.toLowerCase()}
                    </Badge>
                    {row.opportunityId && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/opportunities/${row.opportunityId}`}>
                          Open <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* RIGHT — compliance notice */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="border-success/30 bg-success/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <ShieldCheck className="h-4 w-4" />
              Legal &amp; compliant only
            </CardTitle>
            <CardDescription>
              This lane is built so the only path the code allows is a compliant one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>
                <span className="font-medium text-foreground">You are the collector.</span> Import
                works by manual paste or user-assisted capture of content you are already entitled to
                view.
              </p>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>
                <span className="font-medium text-foreground">No scraping, ever.</span> LEADer never
                logs into Facebook or any closed group, and has no code path that crawls private or
                member-only content.
              </p>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>
                <span className="font-medium text-foreground">Respect the rules.</span> Terms of
                Service, <code className="rounded bg-muted px-1 py-0.5 text-xs">robots.txt</code>,
                paywalls and access controls are honoured — automated discovery is a separate lane
                for public sources only.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Bookmark className="h-4 w-4 text-primary" />
                The “save this post” bookmarklet
              </p>
              <p className="text-muted-foreground">
                A documented bookmarklet you run yourself copies the selected post text and current
                URL, then opens this form prefilled. It runs in your own browser, on a page you are
                already viewing — a convenience over copy-paste, not automation of access.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              When in doubt, default to manual import. The value is triage and intelligence on data
              you can legally collect.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
