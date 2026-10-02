import type { Prisma } from "@prisma/client";
import type { Workspace } from "@/lib/types";

/** Unlinked tasks are personal; linked tasks follow their deal/account workspace. */
export function taskWorkspaceWhere(
  workspace: Workspace,
): Prisma.TaskWhereInput {
  return {
    OR: [
      { deal: { workspace } },
      { dealId: null, account: { workspace } },
      { dealId: null, accountId: null },
    ],
  };
}
