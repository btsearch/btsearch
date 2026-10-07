import { operators, regions } from "@openbts/drizzle";
import { EMF_OFFSET_LIMIT } from "@openbts/shared/contract";
import type { EmfInclude, Operator, Paging, Region } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { encodeCursor, resolveOffset } from "../../lib/cursor.js";
import { loadOperators } from "../operators/details.js";
import { MNC_TO_ENTITY, fetchOperatorsMap } from "../pem/entities.js";
import { attachInternalStationIds } from "../pem/internalStations.js";
import { VOIVODESHIP_TO_TERYT_PREFIX, fetchRegionsMap } from "../pem/voivodeships.js";
import { toRegion } from "../regions/serialize.js";
import { EMF_COUNTRY_CODE } from "./si2pem.js";

export type ListWindow = { offset: number; limit: number };
export type SiteRow = {
  siteId: string | null;
  mnc: number | null;
  regionName: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  address: string | null;
};
export type RegisterFilter = { entityName: string | undefined; voivodeship: string | undefined };

type SiteRefs = {
  siteId: string | null;
  operatorId: number | null;
  stationId: number | null;
  location: { latitude: number; longitude: number; city: string | null; address: string | null };
  regionId: number | null;
  operator?: Operator | null;
  region?: Region | null;
};

export function resolveWindow(query: { limit: number; cursor?: string; offset?: number }): ListWindow {
  return { offset: resolveOffset(query, EMF_OFFSET_LIMIT), limit: query.limit };
}

export function toPaging({ offset, limit }: ListWindow, total: number, includeTotal: boolean | undefined): Paging {
  const next = offset + limit;
  const paging: Paging = { limit, nextCursor: next < total && next <= EMF_OFFSET_LIMIT ? encodeCursor({ offset: next }) : null };
  if (includeTotal) paging.total = total;
  return paging;
}

async function fetchOperatorMncs(operatorIds: readonly number[] | undefined): Promise<number[] | null> {
  if (operatorIds === undefined) return null;

  const rows = await db
    .select({ mnc: operators.mnc })
    .from(operators)
    .where(inArray(operators.id, [...operatorIds]));
  return [...new Set(rows.flatMap((row) => (row.mnc === null ? [] : [row.mnc])))];
}

async function fetchVoivodeshipNames(regionIds: readonly number[] | undefined): Promise<string[] | null> {
  if (regionIds === undefined) return null;

  const rows = await db
    .select({ name: regions.name })
    .from(regions)
    .where(and(inArray(regions.id, [...regionIds]), eq(regions.countryCode, EMF_COUNTRY_CODE)));
  return rows.map((row) => row.name).filter((name) => Object.hasOwn(VOIVODESHIP_TO_TERYT_PREFIX, name));
}

export async function registerFilters(query: { operatorIds?: number[]; regionIds?: number[] }): Promise<RegisterFilter[]> {
  const [mncs, voivodeships] = await Promise.all([fetchOperatorMncs(query.operatorIds), fetchVoivodeshipNames(query.regionIds)]);
  const entityNames: (string | undefined)[] = mncs === null ? [undefined] : [...new Set(mncs.flatMap((mnc) => MNC_TO_ENTITY[mnc] ?? []))];
  const voivodeshipNames: (string | undefined)[] = voivodeships ?? [undefined];
  return entityNames.flatMap((entityName) => voivodeshipNames.map((voivodeship) => ({ entityName, voivodeship })));
}

export async function createSiteMatcher(query: {
  operatorIds?: number[];
  regionIds?: number[];
  siteId?: string;
}): Promise<(site: SiteRow) => boolean> {
  const [mncs, voivodeships] = await Promise.all([fetchOperatorMncs(query.operatorIds), fetchVoivodeshipNames(query.regionIds)]);
  const siteIdPart = query.siteId?.toLowerCase();

  return (site: SiteRow) => {
    if (mncs !== null && (site.mnc === null || !mncs.includes(site.mnc))) return false;
    if (voivodeships !== null && (site.regionName === null || !voivodeships.includes(site.regionName))) return false;
    return siteIdPart === undefined || site.siteId?.toLowerCase().includes(siteIdPart) === true;
  };
}

export async function withSiteRefs<Row extends SiteRow>(
  rows: readonly Row[],
  include: readonly EmfInclude[] = [],
): Promise<{ row: Row; refs: SiteRefs }[]> {
  const [operatorsByMnc, regionsByName, matched] = await Promise.all([
    fetchOperatorsMap(rows.map((row) => row.mnc)),
    fetchRegionsMap(rows.map((row) => row.regionName)),
    attachInternalStationIds(rows.map((row) => ({ station_id: row.siteId, operator: row.mnc === null ? null : { mnc: row.mnc } }))),
  ]);
  const operatorIds = [...operatorsByMnc.values()].map((operator) => operator.id);
  const operatorsById = await loadOperators(db, include.includes("operator") ? operatorIds : []);

  return rows.map((row, index) => {
    const operatorId = row.mnc === null ? null : (operatorsByMnc.get(row.mnc)?.id ?? null);
    const region = row.regionName === null ? undefined : regionsByName.get(row.regionName);
    const refs: SiteRefs = {
      siteId: row.siteId,
      operatorId,
      stationId: matched[index]?.internal_station_id ?? null,
      location: { latitude: row.latitude, longitude: row.longitude, city: row.city, address: row.address },
      regionId: region?.id ?? null,
    };
    if (include.includes("operator")) refs.operator = operatorId === null ? null : (operatorsById.get(operatorId) ?? null);
    if (include.includes("region")) refs.region = region ? toRegion(region) : null;
    return { row, refs };
  });
}
