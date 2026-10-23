import { contributorBlocks } from "@openbts/drizzle";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { DetailedErrorResponse } from "../../errors.js";

type ContributorBlock = { until: Date | null };

export async function findActiveBlock(userId: string): Promise<ContributorBlock | undefined> {
  const [block] = await db
    .select({ until: contributorBlocks.until })
    .from(contributorBlocks)
    .where(and(eq(contributorBlocks.userId, userId), or(isNull(contributorBlocks.until), gt(contributorBlocks.until, new Date()))))
    .limit(1);
  return block;
}

export function assertNotBlocked(block: ContributorBlock | undefined): void {
  if (block) throw new DetailedErrorResponse("CONTRIBUTOR_BLOCKED", [{ until: block.until?.toISOString() ?? null }]);
}
