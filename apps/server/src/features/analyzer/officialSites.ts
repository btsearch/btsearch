import { officialSources as sourceDefinitions } from "@openbts/country-packs/sources";
import type { OfficialSourceDefinition, UnmatchedLteCell } from "@openbts/country-packs/sources";
import { officialLocations, officialSites, officialSources } from "@openbts/drizzle";
import { OFFICIAL_SITES_PER_CELL } from "@openbts/shared/contract";
import type { OfficialSiteRef } from "@openbts/shared/contract";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { loadOfficialVisibility, officialLocationIsPublic } from "../official/visibility.js";

export type UnmatchedCell = UnmatchedLteCell & { countryCode: string };
export type OfficialSiteMatches = { siteIds: number[][]; sites: OfficialSiteRef[] };

async function loadPublicSites(req: FastifyRequest, siteIds: readonly number[]): Promise<OfficialSiteRef[]> {
  if (siteIds.length === 0) return [];

  const visibility = await loadOfficialVisibility(req);
  const rows = await db
    .select({
      id: officialSites.id,
      sourceKey: officialSources.key,
      siteId: officialSites.station_id,
      operatorId: officialSites.operator_id,
      regionId: officialLocations.region_id,
      latitude: officialLocations.latitude,
      longitude: officialLocations.longitude,
      city: officialLocations.city,
      address: officialLocations.address,
    })
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
    .where(and(inArray(officialSites.id, [...siteIds]), officialLocationIsPublic(officialSites.location_id, visibility)))
    .orderBy(asc(officialSites.id));

  return rows.map(({ latitude, longitude, city, address, ...site }) => ({ ...site, location: { latitude, longitude, city, address } }));
}

async function findSourceSites(source: OfficialSourceDefinition, cells: readonly (UnmatchedCell | null)[]): Promise<number[][]> {
  const siteIds: number[][] = cells.map(() => []);
  const inCountry = cells.flatMap((cell, position) => (cell?.countryCode === source.countryCode ? [{ cell, position }] : []));
  if (!source.findOfficialSiteIdsForCells || inCountry.length === 0) return siteIds;

  const matched = await source.findOfficialSiteIdsForCells({ db, cells: inCountry.map(({ cell }) => cell) });
  for (const [index, { position }] of inCountry.entries()) siteIds[position] = matched[index] ?? [];
  return siteIds;
}

export async function findOfficialSites(req: FastifyRequest, cells: readonly (UnmatchedCell | null)[]): Promise<OfficialSiteMatches> {
  const siteIdsBySource = await Promise.all(sourceDefinitions.map((source) => findSourceSites(source, cells)));
  const candidates = cells.map((_cell, position) => unique(siteIdsBySource.flatMap((sourceSiteIds) => sourceSiteIds[position] ?? [])));
  const publicSites = await loadPublicSites(req, unique(candidates.flat()));
  const publicSiteIds = new Set(publicSites.map((site) => site.id));
  const siteIds = candidates.map((ids) => ids.filter((id) => publicSiteIds.has(id)).slice(0, OFFICIAL_SITES_PER_CELL));
  const listedSiteIds = new Set(siteIds.flat());

  return { siteIds, sites: publicSites.filter((site) => listedSiteIds.has(site.id)) };
}
