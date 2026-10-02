import { redirect } from "next/navigation";

import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function OpportunityDetailCompatibilityPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const ownerId = await requireOwnerId();
  const deal = await db.deal.findFirst({
    where: { ownerId, legacyOpportunityId: params.id },
    select: { id: true },
  });
  redirect(deal ? `/deals/${deal.id}` : "/deals");
}
