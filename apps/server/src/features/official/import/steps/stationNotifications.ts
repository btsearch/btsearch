import { locations, officialLocations, officialPermits, officialSites, stations, stationsPermits } from "@openbts/drizzle";
import { eq, sql } from "drizzle-orm";

import { idsIn } from "../../../../lib/conditions.js";
import type { DbTx } from "../../../../types/global.js";
import { buildInternalStationActionUrl, buildOfficialSiteActionUrl } from "../../../notifications/actionUrls.js";
import { notifyStationsWatchers } from "../../../notifications/service.js";
import { readEveryChange } from "../changes.js";
import type { AfterStep, AfterStepContext, ChangeKind, ChangeRow } from "../types.js";
import { notifyInPages } from "./notificationPages.js";

type LinkState = { wasLinked: boolean; isLinked: boolean };
type LinkTally = { lastSeq: number; linksByPermit: Map<number, LinkState> };
type StationNotification = Parameters<typeof notifyStationsWatchers>[0][number];

export type StationLinkSummary = { stationId: number; lastSeq: number; linkedPermitIds: number[]; unlinkedPermitIds: number[] };
export type StoredStation = { id: number; siteCode: string; latitude: number | null; longitude: number | null };
export type LinkedPermit = { stationId: number; permitId: number; officialSiteId: number; latitude: number; longitude: number };

const LINK_CHANGE_KINDS: readonly ChangeKind[] = ["site_added", "station_linked", "station_unlinked"];

export function addedSiteIdsOf(changes: readonly ChangeRow[]): Set<number> {
  return new Set(changes.flatMap((change) => (change.kind === "site_added" && change.officialSiteId !== null ? [change.officialSiteId] : [])));
}

export function summarizeStationLinks(changes: readonly ChangeRow[]): StationLinkSummary[] {
  const linkChanges = changes.filter((change) => change.kind === "station_linked" || change.kind === "station_unlinked");
  const tallies = new Map<number, LinkTally>();
  for (const change of linkChanges.toSorted((first, second) => first.seq - second.seq)) {
    if (change.stationId === null || change.permitId === null) continue;

    const known = tallies.get(change.stationId);
    const tally = known ?? { lastSeq: change.seq, linksByPermit: new Map<number, LinkState>() };
    if (!known) tallies.set(change.stationId, tally);

    const isLinked = change.kind === "station_linked";
    const link = tally.linksByPermit.get(change.permitId);
    tally.lastSeq = change.seq;
    if (link) link.isLinked = isLinked;
    else tally.linksByPermit.set(change.permitId, { wasLinked: !isLinked, isLinked });
  }

  return [...tallies]
    .map(([stationId, tally]) => {
      const changedLinks = [...tally.linksByPermit]
        .filter(([, link]) => link.isLinked !== link.wasLinked)
        .toSorted(([firstPermitId], [secondPermitId]) => firstPermitId - secondPermitId);
      return {
        stationId,
        lastSeq: tally.lastSeq,
        linkedPermitIds: changedLinks.filter(([, link]) => link.isLinked).map(([permitId]) => permitId),
        unlinkedPermitIds: changedLinks.filter(([, link]) => !link.isLinked).map(([permitId]) => permitId),
      };
    })
    .toSorted((first, second) => first.lastSeq - second.lastSeq);
}

export function stationNotificationOf(
  summary: StationLinkSummary,
  station: StoredStation,
  linkedPermits: readonly LinkedPermit[],
  addedSiteIds: ReadonlySet<number>,
): StationNotification | null {
  const permitsAdded = linkedPermits.length;
  const permitsDeleted = summary.unlinkedPermitIds.length;
  const sitesAdded = new Set(linkedPermits.map((permit) => permit.officialSiteId)).intersection(addedSiteIds).size;
  const count = permitsAdded + permitsDeleted + sitesAdded;
  if (count === 0) return null;

  const [firstPermit] = linkedPermits;
  const ownLocation =
    station.latitude !== null && station.longitude !== null ? { latitude: station.latitude, longitude: station.longitude } : undefined;

  return {
    stationId: station.id,
    stationStringId: station.siteCode,
    type: "station_official_permit_added",
    metadata: { permits_added: permitsAdded, permits_deleted: permitsDeleted, official_sites_added: sitesAdded, count },
    actionUrl: firstPermit
      ? buildOfficialSiteActionUrl({ id: firstPermit.officialSiteId, location: { latitude: firstPermit.latitude, longitude: firstPermit.longitude } })
      : buildInternalStationActionUrl({ id: station.id, location: ownLocation }),
  };
}

async function readStations(tx: DbTx, stationIds: readonly number[]): Promise<Map<number, StoredStation>> {
  const stored = await tx
    .select({ id: stations.id, siteCode: stations.station_id, latitude: locations.latitude, longitude: locations.longitude })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .where(sql`${stations.id} IN ${idsIn(stationIds)}`);
  return new Map(stored.map((station) => [station.id, station]));
}

async function readLinkedPermits(tx: DbTx, summaries: readonly StationLinkSummary[]): Promise<Map<number, LinkedPermit[]>> {
  const pairs = summaries.flatMap(({ stationId, linkedPermitIds }) =>
    linkedPermitIds.map((permitId) => ({ station_id: stationId, permit_id: permitId })),
  );
  if (pairs.length === 0) return new Map();

  const linked = await tx.execute<LinkedPermit>(sql`
    SELECT link.station_id AS "stationId", permit.id AS "permitId", site.id AS "officialSiteId", place.latitude, place.longitude
    FROM jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) AS added (station_id integer, permit_id integer)
    JOIN ${stationsPermits} AS link ON link.station_id = added.station_id AND link.permit_id = added.permit_id
    JOIN ${officialPermits} AS permit ON permit.id = link.permit_id
    JOIN ${officialSites} AS site ON site.id = permit.official_site_id
    JOIN ${officialLocations} AS place ON place.id = site.location_id
    ORDER BY link.station_id, permit.id
  `);
  return Map.groupBy(linked, (permit) => permit.stationId);
}

async function notifyStations(tx: DbTx, summaries: readonly StationLinkSummary[], addedSiteIds: ReadonlySet<number>): Promise<void> {
  const storedStations = await readStations(
    tx,
    summaries.map((summary) => summary.stationId),
  );
  const linkedPermits = await readLinkedPermits(tx, summaries);
  const notifications = summaries.flatMap((summary) => {
    const station = storedStations.get(summary.stationId);
    const notification = station ? stationNotificationOf(summary, station, linkedPermits.get(summary.stationId) ?? [], addedSiteIds) : null;
    return notification ? [notification] : [];
  });
  await notifyStationsWatchers(notifications, tx);
}

async function perform(context: AfterStepContext): Promise<void> {
  const changes = await context.transaction((tx) => readEveryChange(tx, context.run.id, LINK_CHANGE_KINDS));
  const addedSiteIds = addedSiteIdsOf(changes);
  await notifyInPages(context, summarizeStationLinks(changes), (tx, page) => notifyStations(tx, page, addedSiteIds));
}

export const stationNotifications: AfterStep = { name: "station_notifications", runsInDryRun: false, perform };
