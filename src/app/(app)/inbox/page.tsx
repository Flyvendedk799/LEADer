import Link from "next/link";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { filterVisibleLaneCandidates } from "@/lib/crm/lanes";
import { workspaceFromRoute } from "@/lib/workspace-context";
import { PageHeader } from "@/components/shared/page-header";
import { ReviewInbox } from "@/components/discovery/review-inbox";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function InboxPage(props: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const searchParams = await props.searchParams;
  const ownerId = await requireOwnerId();
  const workspace = workspaceFromRoute("/inbox", searchParams);
  const candidate =
    typeof searchParams.candidate === "string"
      ? searchParams.candidate
      : undefined;
  const rows = await db.discoveryCandidate.findMany({
    where: {
      ownerId,
      workspace,
      status: { in: ["NEW", "REVIEWED"] },
      ...(candidate ? { id: candidate } : {}),
    },
    include: {
      lane: true,
      evidence: { take: 3, orderBy: { createdAt: "desc" } },
    },
    orderBy: [
      { pursuitScore: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 100,
  });
  const leads = filterVisibleLaneCandidates(rows);
  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="shrink-0 space-y-6">
        <PageHeader
          title="Review leads"
          description="Your discoveries, ready for a decision. Check the fit, verify the source, and choose what to pursue."
        >
          <Button variant="outline" asChild>
            <Link href={`/discover?workspace=${workspace}`}>Find more leads</Link>
          </Button>
        </PageHeader>
        <div className="flex items-center justify-between border-b pb-4">
          <p className="text-sm text-muted-foreground">
            {leads.length}
            {rows.length === 100 ? "+" : ""} leads awaiting review ·{" "}
            {workspace === "DK" ? "Denmark" : "International"}
          </p>
          {candidate && (
            <Link
              href={`/inbox?workspace=${workspace}`}
              className="text-sm text-primary"
            >
              Show all leads
            </Link>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-2">
        <ReviewInbox leads={leads} workspace={workspace} />
      </div>
    </div>
  );
}
