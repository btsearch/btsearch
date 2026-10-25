import { observationFlags, siteLinks } from "@openbts/drizzle";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { isPlaceholderSiteId } from "../../../stations/siteIds.js";
import { type ObservedSiteRecord, loadObservedSites } from "../../sites/read.js";
import type { RaisedFlag } from "../kinds.js";
import { stationSubject } from "../subjects.js";
import { type FlagSyncCounts, NOTHING_SYNCED, flagsIn, syncFlags } from "../sync.js";
import { isFlagSubject } from "./flaggedSite.js";
import { type RegisterLink, loadRegisterLinks, registerNumberOf } from "./registerNumbers.js";
import { loadStationPlaces } from "./stationPlaces.js";

type PlaceholderStation = { id: number; operatorId: number | null; hasPlaceholder: boolean };

export function raiseSiteIdKnownFlag(
  station: PlaceholderStation,
  sites: readonly ObservedSiteRecord[],
  links: readonly RegisterLink[],
): RaisedFlag<"siteIdKnown"> | null {
  if (!station.hasPlaceholder || station.operatorId === null) return null;

  const matched = sites.filter((site) => isFlagSubject(site) && site.status === "matched" && site.matchedStationId === station.id);
  const matchedIds = new Set(matched.map((site) => site.id));
  const found = registerNumberOf(
    links.filter((link) => matchedIds.has(link.observedSiteId)),
    station.operatorId,
  );
  if (found === null) return null;

  const namingIds = new Set(links.filter((link) => link.siteId === found.siteId).map((link) => link.observedSiteId));
  const [naming] = matched.filter((site) => namingIds.has(site.id)).toSorted((a, b) => a.id - b.id);
  if (naming === undefined || naming.nodeId === null) return null;
  return {
    kind: "siteIdKnown",
    subjectKey: stationSubject(station.id),
    refs: { stationId: station.id, observedSiteId: naming.id },
    evidence: { officialSiteId: found.officialSiteId, enbid: naming.nodeId },
    suggestion: { siteId: found.siteId },
    measure: { siteId: found.siteId },
  };
}

async function findStationsToCheckForSiteId(tx: DbTx, sites: readonly ObservedSiteRecord[], siteIds: readonly number[]): Promise<number[]> {
  const flagged = await tx
    .select({ stationId: observationFlags.stationId })
    .from(observationFlags)
    .where(
      and(isNull(observationFlags.closedReason), eq(observationFlags.kind, "siteIdKnown"), inArray(observationFlags.observedSiteId, [...siteIds])),
    );
  const matched = sites.filter((site) => site.status === "matched").map((site) => site.matchedStationId);
  return unique([...matched, ...flagged.map((flag) => flag.stationId)]);
}

export async function syncSiteIdFlags(
  tx: DbTx,
  sites: readonly ObservedSiteRecord[],
  siteIds: readonly number[],
  resolvedById: string | null,
): Promise<FlagSyncCounts> {
  const stationIds = await findStationsToCheckForSiteId(tx, sites, siteIds);
  if (stationIds.length === 0) return NOTHING_SYNCED;

  const linked = await tx
    .select({ observedSiteId: siteLinks.observedSiteId })
    .from(siteLinks)
    .where(and(inArray(siteLinks.stationId, stationIds), eq(siteLinks.kind, "matched")));
  const loadedIds = new Set(sites.map((site) => site.id));
  const [places, others, links] = await Promise.all([
    loadStationPlaces(tx, stationIds),
    loadObservedSites(unique(linked.map((link) => link.observedSiteId)).filter((siteId) => !loadedIds.has(siteId))),
    loadRegisterLinks(tx, unique(linked.map((link) => link.observedSiteId))),
  ]);
  const matchedSites = [...sites, ...others];
  const raised = stationIds.flatMap((id) => {
    const place = places.get(id);
    if (place === undefined) return [];
    const station = { id, operatorId: place.operatorId, hasPlaceholder: isPlaceholderSiteId(place.siteId) };
    return raiseSiteIdKnownFlag(station, matchedSites, links) ?? [];
  });
  const numbered = stationIds.filter((id) => {
    const place = places.get(id);
    return place !== undefined && !isPlaceholderSiteId(place.siteId);
  });
  return syncFlags(tx, {
    kinds: ["siteIdKnown"],
    lookedAt: inArray(observationFlags.stationId, stationIds),
    raised,
    fixed: flagsIn(numbered.map((id) => ({ kind: "siteIdKnown", subjectKey: stationSubject(id) }))),
    resolvedById,
  });
}
