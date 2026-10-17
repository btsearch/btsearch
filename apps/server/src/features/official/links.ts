/* eslint-disable no-await-in-loop */
import { locations, officialLocations, officialPermits, officialSites, stations, stationsPermits } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, asc, eq, inArray, or, sql } from "drizzle-orm";

import { chunks } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";

export type StationGroupKey = { operatorId: number | null; siteId: string };
export type StationLink = { stationId: number; permitId: number };
export type StationLinkChanges = { added: StationLink[]; removed: StationLink[] };
export type LinkablePermit = {
  permitId: number;
  officialSiteId: number;
  sourceId: number;
  operatorId: number;
  siteId: string;
  longitude: number;
  latitude: number;
};
export type LinkableStation = { stationId: number; operatorId: number | null; siteId: string; longitude: number | null; latitude: number | null };

export type LinkGroupKey = { operatorId: number; siteId: string };
type StoredLink = StationLink & { id: number };

const GROUPS_PER_STATEMENT = 500;
const LINKS_PER_STATEMENT = 1_000;

function groupKey({ operatorId, siteId }: StationGroupKey): string {
  return JSON.stringify([operatorId, siteId]);
}

function sourceGroupKey({ sourceId, operatorId, siteId }: LinkablePermit): string {
  return JSON.stringify([sourceId, operatorId, siteId]);
}

function linkKey({ stationId, permitId }: StationLink): string {
  return `${stationId}:${permitId}`;
}

export function decideStationLinks(permits: readonly LinkablePermit[], ourStations: readonly LinkableStation[]): StationLink[] {
  const stationsByGroup = new Map(ourStations.filter(({ operatorId }) => operatorId !== null).map((station) => [groupKey(station), station]));
  const siteCountsBySourceGroup = new Map(
    [...Map.groupBy(permits, sourceGroupKey)].map(([key, groupPermits]) => [key, new Set(groupPermits.map((permit) => permit.officialSiteId)).size]),
  );

  return permits.flatMap((permit) => {
    const station = stationsByGroup.get(groupKey(permit));
    if (!station) return [];

    const isAtTheStation = permit.longitude === station.longitude && permit.latitude === station.latitude;
    const isTheOnlySite = siteCountsBySourceGroup.get(sourceGroupKey(permit)) === 1;
    return isAtTheStation || isTheOnlySite ? [{ stationId: station.stationId, permitId: permit.permitId }] : [];
  });
}

function withOperator(groups: readonly StationGroupKey[]): LinkGroupKey[] {
  const groupsByKey = new Map<string, LinkGroupKey>();
  for (const { operatorId, siteId } of groups) {
    if (operatorId !== null) groupsByKey.set(groupKey({ operatorId, siteId }), { operatorId, siteId });
  }
  return [...groupsByKey.values()];
}

function inGroups(siteId: SQLWrapper, operatorId: SQLWrapper, groups: readonly LinkGroupKey[]): SQL {
  return sql`(${siteId}, ${operatorId}) IN (
    SELECT link_group."siteId", link_group."operatorId"
    FROM jsonb_to_recordset(${JSON.stringify(groups)}::jsonb) AS link_group ("siteId" text, "operatorId" integer)
  )`;
}

async function lockStations(tx: DbTx, groups: readonly LinkGroupKey[]): Promise<Set<number>> {
  const locked = await tx
    .select({ id: stations.id })
    .from(stations)
    .where(inGroups(stations.station_id, stations.operator_id, groups))
    .orderBy(asc(stations.id))
    .for("no key update");
  return new Set(locked.map(({ id }) => id));
}

async function readPermitsWithLinks(tx: DbTx, groups: readonly LinkGroupKey[]) {
  return tx
    .select({
      permitId: officialPermits.id,
      officialSiteId: officialSites.id,
      sourceId: officialSites.source_id,
      operatorId: officialSites.operator_id,
      siteId: officialSites.station_id,
      longitude: officialLocations.longitude,
      latitude: officialLocations.latitude,
      linkId: stationsPermits.id,
      linkedStationId: stationsPermits.station_id,
    })
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(officialPermits, eq(officialPermits.official_site_id, officialSites.id))
    .leftJoin(stationsPermits, eq(stationsPermits.permit_id, officialPermits.id))
    .where(inGroups(officialSites.station_id, officialSites.operator_id, groups));
}

async function readStations(tx: DbTx, groups: readonly LinkGroupKey[]): Promise<LinkableStation[]> {
  return tx
    .select({
      stationId: stations.id,
      operatorId: stations.operator_id,
      siteId: stations.station_id,
      longitude: locations.longitude,
      latitude: locations.latitude,
    })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .where(inGroups(stations.station_id, stations.operator_id, groups));
}

async function insertLinks(tx: DbTx, links: readonly StationLink[]): Promise<StationLink[]> {
  const inserted: StationLink[] = [];
  for (const page of chunks(links, LINKS_PER_STATEMENT)) {
    const insertedOfPage = await tx
      .insert(stationsPermits)
      .values(page.map(({ stationId, permitId }) => ({ station_id: stationId, permit_id: permitId })))
      .returning({ stationId: stationsPermits.station_id, permitId: stationsPermits.permit_id });
    inserted.push(...insertedOfPage);
  }
  return inserted;
}

async function deleteLinks(tx: DbTx, links: readonly StoredLink[]): Promise<StationLink[]> {
  const deleted: StationLink[] = [];
  for (const page of chunks(links, LINKS_PER_STATEMENT)) {
    const deletedOfPage = await tx
      .delete(stationsPermits)
      .where(
        inArray(
          stationsPermits.id,
          page.map((link) => link.id),
        ),
      )
      .returning({ stationId: stationsPermits.station_id, permitId: stationsPermits.permit_id });
    deleted.push(...deletedOfPage);
  }
  return deleted;
}

async function readGroupState(tx: DbTx, groups: readonly LinkGroupKey[], locksStations: boolean) {
  for (;;) {
    const lockedIds = locksStations ? await lockStations(tx, groups) : null;
    const permitsWithLinks = await readPermitsWithLinks(tx, groups);
    const ourStations = permitsWithLinks.length > 0 ? await readStations(tx, groups) : [];
    if (lockedIds === null || ourStations.every(({ stationId }) => lockedIds.has(stationId))) return { permitsWithLinks, ourStations };
  }
}

async function correctGroups(tx: DbTx, groups: readonly LinkGroupKey[], locksStations: boolean): Promise<StationLinkChanges> {
  const { permitsWithLinks, ourStations } = await readGroupState(tx, groups, locksStations);
  const permits = [...new Map(permitsWithLinks.map((permit) => [permit.permitId, permit])).values()];
  const stored = permitsWithLinks.flatMap(({ linkId, linkedStationId, permitId }): StoredLink[] =>
    linkId === null || linkedStationId === null ? [] : [{ id: linkId, stationId: linkedStationId, permitId }],
  );
  const wanted = decideStationLinks(permits, ourStations);
  const storedKeys = new Set(stored.map(linkKey));
  const wantedKeys = new Set(wanted.map(linkKey));

  const added = await insertLinks(
    tx,
    wanted.filter((link) => !storedKeys.has(linkKey(link))),
  );
  const removed = await deleteLinks(
    tx,
    stored.filter((link) => !wantedKeys.has(linkKey(link))),
  );
  return { added, removed };
}

export async function readOfficialGroupsAfter(tx: Pick<DbTx, "selectDistinct">, last: LinkGroupKey | undefined): Promise<LinkGroupKey[]> {
  return tx
    .selectDistinct({ siteId: officialSites.station_id, operatorId: officialSites.operator_id })
    .from(officialSites)
    .where(last && sql`(${officialSites.station_id}, ${officialSites.operator_id}) > (${last.siteId}::text, ${last.operatorId}::integer)`)
    .orderBy(asc(officialSites.station_id), asc(officialSites.operator_id))
    .limit(GROUPS_PER_STATEMENT);
}

export async function correctStationLinks(
  tx: DbTx,
  groups: readonly StationGroupKey[],
  { locksStations = true }: { locksStations?: boolean } = {},
): Promise<StationLinkChanges> {
  const changes: StationLinkChanges = { added: [], removed: [] };
  for (const page of chunks(withOperator(groups), GROUPS_PER_STATEMENT)) {
    const { added, removed } = await correctGroups(tx, page, locksStations);
    changes.added.push(...added);
    changes.removed.push(...removed);
  }
  return changes;
}

export async function findStationGroups(
  tx: Pick<DbTx, "select">,
  { stationIds = [], locationIds = [] }: { stationIds?: readonly number[]; locationIds?: readonly number[] },
): Promise<StationGroupKey[]> {
  return tx
    .select({ operatorId: stations.operator_id, siteId: stations.station_id })
    .from(stations)
    .where(or(inArray(stations.id, [...stationIds]), inArray(stations.location_id, [...locationIds])));
}
