import {
  officialDatasets,
  officialLocations,
  officialPermitListings,
  officialPermits,
  officialSites,
  officialSources,
  regions,
  stationsPermits,
} from "@openbts/drizzle";
import type {
  OfficialPermit,
  OfficialPermitInclude,
  OfficialPermitList,
  OfficialPermitListQuery,
  OfficialPermitSort,
  Paging,
} from "@openbts/shared/contract";
import { type SQL, and, count, eq, exists, inArray, notExists } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { type SortColumn, type SortField, createKeyset } from "../../lib/keyset.js";
import { hasStaffPermission } from "../access/staff.js";
import { operatedBy } from "../operators/sharing.js";
import { decisionOrDatasetKindMatches, linkedToStations, officialAreaConditions, permitLabelCondition, permitNumberMatches } from "./filters.js";
import { type OfficialPermitRows, loadPermitStationIds, officialSiteRowColumns, serializeSitePermits, serializeSites } from "./serialize.js";
import { loadOfficialVisibility, officialLocationIsPublic } from "./visibility.js";

const SORT_COLUMNS: Record<SortField<OfficialPermitSort>, SortColumn | null> = {
  id: null,
  updatedAt: { column: officialPermits.updatedAt, kind: "instant" },
};

const permitRowColumns = { ...officialSiteRowColumns, permit: officialPermits };

const stationLinks = db.select({ id: stationsPermits.id }).from(stationsPermits).where(eq(stationsPermits.permit_id, officialPermits.id));

function listedByDatasets(datasetKeys: readonly string[]): SQL {
  return exists(
    db
      .select({ permitId: officialPermitListings.permitId })
      .from(officialPermitListings)
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialPermitListings.datasetId))
      .where(and(eq(officialPermitListings.permitId, officialPermits.id), inArray(officialDatasets.key, [...datasetKeys]))),
  );
}

function permitConditions(query: OfficialPermitListQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions: SQL[] = [];
  const labelMatch = permitLabelCondition(query);

  if (query.officialSiteIds) conditions.push(inArray(officialPermits.official_site_id, query.officialSiteIds));
  if (query.stationIds) conditions.push(linkedToStations(officialPermits.id, query.stationIds, hiddenCountryCodes));
  if (query.siteIds) conditions.push(inArray(officialSites.station_id, query.siteIds));
  if (query.operatorIds) conditions.push(operatedBy(officialSites.operator_id, query.operatorIds));
  if (query.isLinked !== undefined) conditions.push(query.isLinked ? exists(stationLinks) : notExists(stationLinks));
  if (labelMatch) conditions.push(labelMatch);
  if (query.kinds) conditions.push(decisionOrDatasetKindMatches(query.kinds));
  if (query.datasetKeys) conditions.push(listedByDatasets(query.datasetKeys));
  if (query.q) conditions.push(permitNumberMatches(officialPermits.decision_number, query.q));
  return conditions;
}

async function serializePermits(
  rows: readonly OfficialPermitRows[],
  include: readonly OfficialPermitInclude[],
  hiddenCountryCodes: readonly string[],
): Promise<OfficialPermit[]> {
  const wants = (name: OfficialPermitInclude) => include.includes(name);
  const wantsSite = wants("officialSite") || wants("officialSite.location");
  const siteRows = [...new Map(rows.map((row) => [row.site.id, row])).values()];
  const siteParts = { location: wants("officialSite.location"), region: false, permits: false, sectors: false };

  const [permits, stationIdsByPermit, sites] = await Promise.all([
    serializeSitePermits(rows, wants("sectors")),
    wants("stations")
      ? loadPermitStationIds(
          rows.map((row) => row.permit.id),
          hiddenCountryCodes,
        )
      : null,
    wantsSite ? serializeSites(siteRows, siteParts, hiddenCountryCodes) : [],
  ]);
  const sitesById = new Map(sites.map((site) => [site.id, site]));

  return permits.map((sitePermit) => {
    const permit: OfficialPermit = sitePermit;
    const site = sitesById.get(permit.officialSiteId);
    if (stationIdsByPermit) permit.stationIds = stationIdsByPermit.get(permit.id) ?? [];
    if (site) permit.officialSite = site;
    return permit;
  });
}

export async function fetchOfficialPermitPage(req: FastifyRequest, query: OfficialPermitListQuery): Promise<OfficialPermitList> {
  const { include = [], sort, limit, cursor, offset, includeTotal, isLinked: wantsLinked } = query;
  if (wantsLinked === false && !(await hasStaffPermission(req, { official_permits: ["read_unassigned"] }))) {
    throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  }

  const keyset = createKeyset(sort, officialPermits.id, SORT_COLUMNS, cursor);
  const visibility = await loadOfficialVisibility(req);
  const filters = and(...officialAreaConditions(query, visibility), ...permitConditions(query, visibility.hiddenCountryCodes));

  const [rows, totals] = await Promise.all([
    db
      .select({ ...permitRowColumns, key: keyset.key })
      .from(officialPermits)
      .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
      .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
      .innerJoin(regions, eq(regions.id, officialLocations.region_id))
      .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal
      ? db
          .select({ total: count() })
          .from(officialPermits)
          .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
          .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
          .innerJoin(regions, eq(regions.id, officialLocations.region_id))
          .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
          .where(filters)
      : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.permit.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return { data: await serializePermits(page, include, visibility.hiddenCountryCodes), paging };
}

export async function readOfficialPermit(req: FastifyRequest, permitId: number, include: readonly OfficialPermitInclude[]): Promise<OfficialPermit> {
  const visibility = await loadOfficialVisibility(req);
  const [row] = await db
    .select(permitRowColumns)
    .from(officialPermits)
    .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(regions, eq(regions.id, officialLocations.region_id))
    .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
    .where(and(eq(officialPermits.id, permitId), officialLocationIsPublic(officialLocations.id, visibility)))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const [permit] = await serializePermits([row], include, visibility.hiddenCountryCodes);
  return permit!;
}
