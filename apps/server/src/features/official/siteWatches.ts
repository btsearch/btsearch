import { officialSiteWatches } from "@openbts/drizzle";
import { type SQL, and, eq } from "drizzle-orm";

import db from "../../database/psql.js";

function watchOf(userId: string, siteId: number): SQL | undefined {
  return and(eq(officialSiteWatches.userId, userId), eq(officialSiteWatches.officialSiteId, siteId));
}

export async function isWatchingOfficialSite(userId: string, siteId: number): Promise<boolean> {
  const [watch] = await db.select({ id: officialSiteWatches.id }).from(officialSiteWatches).where(watchOf(userId, siteId)).limit(1);
  return watch !== undefined;
}

export async function watchOfficialSite(userId: string, siteId: number): Promise<void> {
  await db
    .insert(officialSiteWatches)
    .values({ userId, officialSiteId: siteId })
    .onConflictDoNothing({ target: [officialSiteWatches.userId, officialSiteWatches.officialSiteId] });
}

export async function unwatchOfficialSite(userId: string, siteId: number): Promise<void> {
  await db.delete(officialSiteWatches).where(watchOf(userId, siteId));
}
