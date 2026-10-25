import { contributors, users } from "@openbts/drizzle";
import type { MeasurementListing } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";

export async function findListing(userId: string): Promise<MeasurementListing> {
  const [row] = await db
    .select({ listedAt: contributors.listedAt, profileVisibility: users.profileVisibility })
    .from(users)
    .leftJoin(contributors, eq(contributors.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const listedAt = row?.listedAt ?? null;
  return { isListed: listedAt !== null, listedAt: listedAt?.toISOString() ?? null, hasPublicProfile: row?.profileVisibility === "public" };
}

export async function saveListing(userId: string, isListed: boolean): Promise<MeasurementListing> {
  const [saved] = await db
    .update(contributors)
    .set({ listedAt: isListed ? sql`coalesce(${contributors.listedAt}, now())` : null, updatedAt: sql`now()` })
    .where(eq(contributors.userId, userId))
    .returning({ userId: contributors.userId });
  if (!saved) throw new ErrorResponse("TERMS_NOT_ACCEPTED");
  return findListing(userId);
}
