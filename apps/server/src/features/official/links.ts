/* eslint-disable no-await-in-loop */
import { locations, officialLocations, officialPermits, officialSites, stations, stationsOfficialSites } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, and, asc, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm";

import { chunks } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { type LinkableSite, type LinkableStation, type StationLink, decideStationLinks, groupKey } from "./linkRule.js";

export type StationGroupKey = { operatorId: number | null; siteId: string | null };
export type StationLinkChanges = { added: StationLink[]; removed: StationLink[] };
export type LinkGroupKey = { operatorId: number; siteId: string };

const GROUPS_PER_STATEMENT = 500;
const LINKS_PER_STATEMENT = 1_000;

function linkKey({ stationId, officialSiteId }: StationLink): string {
  return `${stationId}:${officialSiteId}`;
}

function withOperator(groups: readonly StationGroupKey[]): LinkGroupKey[] {
  const groupsByKey = new Map<string, LinkGroupKey>();
  for (const { operatorId, siteId } of groups) {
    if (operatorId !== null && siteId !== null) groupsByKey.set(groupKey({ operatorId, siteId }), { operatorId, siteId });
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

async function readSitesWithPermits(tx: DbTx, groups: readonly LinkGroupKey[]): Promise<LinkableSite[]> {
  return tx
    .select({
      officialSiteId: officialSites.id,
      sourceId: officialSites.source_id,
      operatorId: officialSites.operator_id,
      siteId: sql<string>`${officialSites.station_id}`,
      longitude: officialLocations.longitude,
      latitude: officialLocations.latitude,
    })
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .where(
      and(
        inGroups(officialSites.station_id, officialSites.operator_id, groups),
        exists(tx.select({ id: officialPermits.id }).from(officialPermits).where(eq(officialPermits.official_site_id, officialSites.id))),
      ),
    );
}

async function readStoredLinks(tx: DbTx, groups: readonly LinkGroupKey[]): Promise<StationLink[]> {
  return tx
    .select({ stationId: stationsOfficialSites.station_id, officialSiteId: stationsOfficialSites.official_site_id })
    .from(stationsOfficialSites)
    .where(
      or(
        inArray(
          stationsOfficialSites.station_id,
          tx
            .select({ id: stations.id })
            .from(stations)
            .where(inGroups(stations.station_id, stations.operator_id, groups)),
        ),
        inArray(
          stationsOfficialSites.official_site_id,
          tx
            .select({ id: officialSites.id })
            .from(officialSites)
            .where(inGroups(officialSites.station_id, officialSites.operator_id, groups)),
        ),
      ),
    );
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
      .insert(stationsOfficialSites)
      .values(page.map(({ stationId, officialSiteId }) => ({ station_id: stationId, official_site_id: officialSiteId })))
      .returning({ stationId: stationsOfficialSites.station_id, officialSiteId: stationsOfficialSites.official_site_id });
    inserted.push(...insertedOfPage);
  }
  return inserted;
}

async function deleteLinks(tx: DbTx, links: readonly StationLink[]): Promise<StationLink[]> {
  const deleted: StationLink[] = [];
  for (const page of chunks(links, LINKS_PER_STATEMENT)) {
    const deletedOfPage = await tx
      .delete(stationsOfficialSites)
      .where(
        and(
          inArray(
            stationsOfficialSites.station_id,
            page.map((link) => link.stationId),
          ),
          inArray(
            stationsOfficialSites.official_site_id,
            page.map((link) => link.officialSiteId),
          ),
        ),
      )
      .returning({ stationId: stationsOfficialSites.station_id, officialSiteId: stationsOfficialSites.official_site_id });
    deleted.push(...deletedOfPage);
  }
  return deleted;
}

async function readGroupState(tx: DbTx, groups: readonly LinkGroupKey[], locksStations: boolean) {
  for (;;) {
    const lockedIds = locksStations ? await lockStations(tx, groups) : null;
    const sites = await readSitesWithPermits(tx, groups);
    const ourStations = sites.length > 0 ? await readStations(tx, groups) : [];
    if (lockedIds === null || ourStations.every(({ stationId }) => lockedIds.has(stationId))) return { sites, ourStations };
  }
}

async function correctGroups(tx: DbTx, groups: readonly LinkGroupKey[], locksStations: boolean): Promise<StationLinkChanges> {
  const { sites, ourStations } = await readGroupState(tx, groups, locksStations);
  const stored = await readStoredLinks(tx, groups);
  const wanted = decideStationLinks(sites, ourStations);
  const storedKeys = new Set(stored.map(linkKey));
  const wantedKeys = new Set(wanted.map(linkKey));

  const removed = await deleteLinks(
    tx,
    stored.filter((link) => !wantedKeys.has(linkKey(link))),
  );
  const added = await insertLinks(
    tx,
    wanted.filter((link) => !storedKeys.has(linkKey(link))),
  );
  return { added, removed };
}

export async function readOfficialGroupsAfter(tx: Pick<DbTx, "selectDistinct">, last: LinkGroupKey | undefined): Promise<LinkGroupKey[]> {
  return tx
    .selectDistinct({ siteId: sql<string>`${officialSites.station_id}`, operatorId: officialSites.operator_id })
    .from(officialSites)
    .where(
      and(
        isNotNull(officialSites.station_id),
        last && sql`(${officialSites.station_id}, ${officialSites.operator_id}) > (${last.siteId}::text, ${last.operatorId}::integer)`,
      ),
    )
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
