import { officialLocations, officialSites, officialSources, regions } from "@openbts/drizzle";
import type {
  LocationSort,
  OfficialLocation,
  OfficialLocationInclude,
  OfficialLocationList,
  OfficialLocationListQuery,
  OfficialLocationQuery,
  OfficialSite,
  Paging,
} from "@openbts/shared/contract";
import { type SQL, and, asc, count, eq, exists, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { type SortColumn, type SortField, createKeyset } from "../../lib/keyset.js";
import { officialAreaConditions, officialSiteConditions, permitLabelCondition } from "./filters.js";
import { listOfficialSiteIds } from "./lists.js";
import {
  type OfficialLocationRows,
  officialLocationRowColumns,
  officialSiteRowColumns,
  serializeSites,
  toOfficialSiteLocation,
} from "./serialize.js";
import { loadOfficialVisibility, officialLocationIsPublic } from "./visibility.js";

type SiteSelection = { siteMatch: SQL | undefined; permitMatch: SQL | undefined };
type SitesByLocation = Map<number, OfficialSite[]>;

const SORT_COLUMNS: Record<SortField<LocationSort>, SortColumn | null> = {
  id: null,
  createdAt: { column: officialLocations.createdAt, kind: "instant" },
  updatedAt: { column: officialLocations.updatedAt, kind: "instant" },
};

function hasMatchingSite(condition: SQL): SQL {
  return exists(
    db
      .select({ id: officialSites.id })
      .from(officialSites)
      .where(and(eq(officialSites.location_id, officialLocations.id), condition)),
  );
}

async function siteSelection(req: FastifyRequest, query: OfficialLocationQuery): Promise<SiteSelection> {
  const listedSiteIds = await listOfficialSiteIds(req, query.listId);
  return { siteMatch: and(...officialSiteConditions(query, listedSiteIds)), permitMatch: permitLabelCondition(query) };
}

async function loadLocationSites(
  locationIds: number[],
  include: readonly OfficialLocationInclude[],
  { siteMatch, permitMatch }: SiteSelection,
  hiddenCountryCodes: readonly string[],
): Promise<SitesByLocation | null> {
  if (locationIds.length === 0 || !include.some((name) => name.startsWith("sites"))) return null;

  const siteRows = await db
    .select(officialSiteRowColumns)
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(regions, eq(regions.id, officialLocations.region_id))
    .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
    .where(and(inArray(officialSites.location_id, locationIds), siteMatch))
    .orderBy(asc(officialSites.id));
  const parts = {
    location: false,
    region: false,
    permits: include.includes("sites.permits") || include.includes("sites.permits.sectors"),
    sectors: include.includes("sites.permits.sectors"),
    permitCondition: permitMatch,
  };
  return Map.groupBy(await serializeSites(siteRows, parts, hiddenCountryCodes), (site) => site.locationId);
}

function toOfficialLocations(
  rows: readonly OfficialLocationRows[],
  include: readonly OfficialLocationInclude[],
  sitesByLocation: SitesByLocation | null,
): OfficialLocation[] {
  return rows.map((row) => {
    const location: OfficialLocation = toOfficialSiteLocation(row, include.includes("region"));
    if (sitesByLocation) location.sites = sitesByLocation.get(row.location.id) ?? [];
    return location;
  });
}

export async function fetchOfficialLocationPage(req: FastifyRequest, query: OfficialLocationListQuery): Promise<OfficialLocationList> {
  const { include = [], sort, limit, cursor, offset, includeTotal } = query;
  const keyset = createKeyset(sort, officialLocations.id, SORT_COLUMNS, cursor);
  const [visibility, selection] = await Promise.all([loadOfficialVisibility(req), siteSelection(req, query)]);
  const conditions = officialAreaConditions(query, visibility);
  if (selection.siteMatch) conditions.push(hasMatchingSite(selection.siteMatch));
  const filters = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select({ ...officialLocationRowColumns, key: keyset.key })
      .from(officialLocations)
      .innerJoin(regions, eq(regions.id, officialLocations.region_id))
      .innerJoin(officialSources, eq(officialSources.id, officialLocations.source_id))
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal
      ? db
          .select({ total: count() })
          .from(officialLocations)
          .innerJoin(regions, eq(regions.id, officialLocations.region_id))
          .innerJoin(officialSources, eq(officialSources.id, officialLocations.source_id))
          .where(filters)
      : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.location.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  const sitesByLocation = await loadLocationSites(
    page.map((row) => row.location.id),
    include,
    selection,
    visibility.hiddenCountryCodes,
  );
  return { data: toOfficialLocations(page, include, sitesByLocation), paging };
}

export async function readOfficialLocation(req: FastifyRequest, locationId: number, query: OfficialLocationQuery): Promise<OfficialLocation> {
  const { include = [] } = query;
  const [visibility, selection] = await Promise.all([loadOfficialVisibility(req), siteSelection(req, query)]);
  const [[row], sitesByLocation] = await Promise.all([
    db
      .select(officialLocationRowColumns)
      .from(officialLocations)
      .innerJoin(regions, eq(regions.id, officialLocations.region_id))
      .innerJoin(officialSources, eq(officialSources.id, officialLocations.source_id))
      .where(and(eq(officialLocations.id, locationId), officialLocationIsPublic(officialLocations.id, visibility)))
      .limit(1),
    loadLocationSites([locationId], include, selection, visibility.hiddenCountryCodes),
  ]);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const [location] = toOfficialLocations([row], include, sitesByLocation);
  return location!;
}
