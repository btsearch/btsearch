import { ukeLocations, ukePermits, ukeStations } from "@openbts/drizzle";
import { OFFICIAL_SITES_PER_CELL } from "@openbts/shared/contract";
import type { OfficialSiteRef } from "@openbts/shared/contract";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { runLimited } from "../../lib/async/runLimited.js";
import { chunks, unique } from "../../lib/collections.js";

export type OfficialSiteSearch = { operatorIds: readonly number[]; fragments: readonly string[] };
export type OfficialSiteMatches = { siteIds: number[][]; sites: OfficialSiteRef[] };

type PermitMatch = { siteId: number; operatorId: number; fragment: string };

const FRAGMENTS_PER_QUERY = 500;

const permitFragment = sql<string>`split_part(${ukePermits.decision_number}, '/', 3)`;

async function findPermitMatches(fragments: readonly string[], operatorIds: readonly number[]): Promise<PermitMatch[]> {
  const matches: PermitMatch[] = [];
  const tasks = chunks(fragments, FRAGMENTS_PER_QUERY).map((chunk) => async () => {
    const rows = await db
      .selectDistinct({ siteId: ukeStations.id, operatorId: ukeStations.operator_id, fragment: permitFragment })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukeStations.id, ukePermits.uke_station_id))
      .where(and(inArray(permitFragment, chunk), inArray(ukeStations.operator_id, [...operatorIds])));
    matches.push(...rows);
  });

  await runLimited(tasks);
  return matches.sort((a, b) => a.siteId - b.siteId);
}

async function loadSites(siteIds: readonly number[]): Promise<OfficialSiteRef[]> {
  if (siteIds.length === 0) return [];

  const rows = await db
    .select({
      id: ukeStations.id,
      siteId: ukeStations.station_id,
      operatorId: ukeStations.operator_id,
      regionId: ukeLocations.region_id,
      latitude: ukeLocations.latitude,
      longitude: ukeLocations.longitude,
      city: ukeLocations.city,
      address: ukeLocations.address,
    })
    .from(ukeStations)
    .innerJoin(ukeLocations, eq(ukeLocations.id, ukeStations.location_id))
    .where(inArray(ukeStations.id, [...siteIds]))
    .orderBy(asc(ukeStations.id));

  return rows.map(({ latitude, longitude, city, address, ...site }) => ({ ...site, location: { latitude, longitude, city, address } }));
}

export async function findOfficialSites(searches: readonly OfficialSiteSearch[]): Promise<OfficialSiteMatches> {
  const fragments = unique(searches.flatMap((search) => search.fragments));
  const operatorIds = unique(searches.flatMap((search) => search.operatorIds));
  if (fragments.length === 0 || operatorIds.length === 0) return { siteIds: searches.map(() => []), sites: [] };

  const matchesByKey = Map.groupBy(await findPermitMatches(fragments, operatorIds), (match) => `${match.operatorId}:${match.fragment}`);
  const siteIds = searches.map((search) => {
    const keys = search.operatorIds.flatMap((operatorId) => search.fragments.map((fragment) => `${operatorId}:${fragment}`));
    const matches = keys.flatMap((key) => matchesByKey.get(key) ?? []);
    return unique(matches.map((match) => match.siteId)).slice(0, OFFICIAL_SITES_PER_CELL);
  });

  return { siteIds, sites: await loadSites(unique(siteIds.flat())) };
}
