import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";

/** Foreign keys are not authorization. Check every linked record before writes. */
export async function assertOwnedLinks(
  ownerId: string,
  links: {
    dealId?: string | null;
    accountId?: string | null;
    personId?: string | null;
    sourceId?: string | null;
    laneId?: string | null;
  },
) {
  const checks = await Promise.all([
    links.dealId ? db.deal.count({ where: { id: links.dealId, ownerId } }) : 1,
    links.accountId
      ? db.account.count({ where: { id: links.accountId, ownerId } })
      : 1,
    links.personId
      ? db.person.count({ where: { id: links.personId, ownerId } })
      : 1,
    links.sourceId
      ? db.source.count({ where: { id: links.sourceId, ownerId } })
      : 1,
    links.laneId
      ? db.discoveryLane.count({ where: { id: links.laneId, ownerId } })
      : 1,
  ]);
  if (checks.some((count) => count === 0))
    throw new HttpError(
      404,
      "A linked record was not found in your workspace.",
    );
}
