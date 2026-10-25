import { officialSites, officialSources, siteOfficialLinks, stations } from "@openbts/drizzle";
import { and, eq, exists, inArray, isNotNull } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";

export type RegisterLink = { observedSiteId: number; officialSiteId: number; operatorId: number; siteId: string; isTaken: boolean };

export function registerNumberOf(links: readonly RegisterLink[], operatorId: number): { siteId: string; officialSiteId: number } | null {
  const named = links.filter((link) => link.operatorId === operatorId && link.siteId.trim().length > 0);
  const numbers = unique(named.map((link) => link.siteId));
  const [only] = numbers;
  if (only === undefined || numbers.length > 1) return null;

  const naming = named.filter((link) => link.siteId === only);
  if (naming.some((link) => link.isTaken)) return null;
  return { siteId: only, officialSiteId: Math.min(...naming.map((link) => link.officialSiteId)) };
}

export async function loadRegisterLinks(tx: DbTx, siteIds: readonly number[]): Promise<RegisterLink[]> {
  if (siteIds.length === 0) return [];

  const sameNumber = tx
    .select({ id: stations.id })
    .from(stations)
    .where(and(eq(stations.operator_id, officialSites.operator_id), eq(stations.station_id, officialSites.station_id)));
  const rows = await tx
    .select({
      observedSiteId: siteOfficialLinks.observedSiteId,
      officialSiteId: officialSites.id,
      operatorId: officialSites.operator_id,
      siteId: officialSites.station_id,
      isTaken: exists(sameNumber).mapWith(Boolean),
    })
    .from(siteOfficialLinks)
    .innerJoin(officialSites, eq(officialSites.id, siteOfficialLinks.officialSiteId))
    .innerJoin(officialSources, and(eq(officialSources.id, officialSites.source_id), eq(officialSources.isVisible, true)))
    .where(and(inArray(siteOfficialLinks.observedSiteId, [...siteIds]), isNotNull(officialSites.station_id)));
  return rows.flatMap(({ siteId, ...link }) => (siteId === null ? [] : [{ ...link, siteId }]));
}
