import { siteLinks, siteOfficialLinks, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import type { SystemCellMatch } from "../../analyzer/match.js";
import { isPlaceholderSiteId } from "../../stations/siteIds.js";
import type { LockedCell } from "../cells/locks.js";

function isSameSet(wanted: ReadonlySet<number>, stored: readonly number[]): boolean {
  return wanted.size === stored.length && stored.every((id) => wanted.has(id));
}

export async function linkOfficialSites(tx: DbTx, locked: readonly LockedCell[], matches: ReadonlyMap<number, SystemCellMatch>): Promise<void> {
  const candidatesBySite = new Map<number, Set<number>>();
  for (const cell of locked) {
    if (cell.observedSiteId === null || cell.rat !== "LTE") continue;
    const candidates = candidatesBySite.get(cell.observedSiteId) ?? new Set<number>();
    for (const officialSiteId of matches.get(cell.id)?.officialSiteIds ?? []) candidates.add(officialSiteId);
    candidatesBySite.set(cell.observedSiteId, candidates);
  }
  const siteIds = [...candidatesBySite.keys()];
  if (siteIds.length === 0) return;

  const [matchedStationNumbers, stored] = await Promise.all([
    tx
      .select({ siteId: siteLinks.observedSiteId, stationNumber: stations.station_id })
      .from(siteLinks)
      .innerJoin(stations, eq(stations.id, siteLinks.stationId))
      .where(and(inArray(siteLinks.observedSiteId, siteIds), eq(siteLinks.kind, "matched"))),
    tx.select().from(siteOfficialLinks).where(inArray(siteOfficialLinks.observedSiteId, siteIds)),
  ]);
  for (const { siteId, stationNumber } of matchedStationNumbers) {
    if (!isPlaceholderSiteId(stationNumber)) candidatesBySite.set(siteId, new Set());
  }

  const storedBySite = Map.groupBy(stored, (link) => link.observedSiteId);
  const changedSiteIds = siteIds.filter(
    (siteId) => !isSameSet(candidatesBySite.get(siteId) ?? new Set(), storedBySite.get(siteId)?.map((link) => link.officialSiteId) ?? []),
  );
  if (changedSiteIds.length === 0) return;

  await tx.delete(siteOfficialLinks).where(inArray(siteOfficialLinks.observedSiteId, changedSiteIds));
  const rows = changedSiteIds.flatMap((observedSiteId) =>
    [...(candidatesBySite.get(observedSiteId) ?? [])].map((officialSiteId) => ({ observedSiteId, officialSiteId })),
  );
  if (rows.length > 0) await tx.insert(siteOfficialLinks).values(rows);
}
