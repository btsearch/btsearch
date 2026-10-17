import { officialLocations, officialPermits, officialSites, officialSources, regions } from "@openbts/drizzle";
import { OFFSET_LIMIT } from "@openbts/shared/contract";
import type { OfficialSite, OfficialSiteInclude, OfficialSiteList, OfficialSiteListQuery, OfficialSiteSort, Paging } from "@openbts/shared/contract";
import { type SQL, and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { encodeCursor, resolveOffset } from "../../lib/cursor.js";
import { type Keyset, type SortColumn, type SortField, createKeyset } from "../../lib/keyset.js";
import { containsPattern, foldText } from "../search/text.js";
import { hasMatchingPermit, linkedToStations, officialAreaConditions, officialSiteConditions, permitLabelCondition } from "./filters.js";
import { listOfficialSiteIds } from "./lists.js";
import {
  type OfficialSiteParts,
  type OfficialSiteRows,
  loadSiteRelations,
  officialSiteRowColumns,
  serializeSites,
  toOfficialSites,
} from "./serialize.js";
import { type OfficialVisibility, loadOfficialVisibility, officialLocationIsPublic } from "./visibility.js";

type KeysetSort = Exclude<OfficialSiteSort, "relevance">;
type SiteOrder = Omit<Keyset, "cursorAfter"> & { offset: number; cursorAfter: (row: { id: number; key: string | null }) => string | null };

const SORT_COLUMNS: Record<SortField<KeysetSort>, SortColumn | null> = {
  id: null,
  createdAt: { column: officialSites.createdAt, kind: "instant" },
  updatedAt: { column: officialSites.updatedAt, kind: "instant" },
};

function permitNumberContains(text: string): SQL {
  return hasMatchingPermit(ilike(officialPermits.decision_number, containsPattern(text)));
}

function siteTextMatch(text: string): SQL {
  const contains = containsPattern(text);
  const placeContains = foldText(contains);
  return sql`(
    ${officialSites.station_id} ILIKE ${contains}
    OR ${permitNumberContains(text)}
    OR ${foldText(officialLocations.city)} LIKE ${placeContains}
    OR ${foldText(officialLocations.address)} LIKE ${placeContains}
  )`;
}

function siteTextRank(text: string): SQL {
  return sql`CASE
    WHEN upper(${officialSites.station_id}) = ${text.toUpperCase()} THEN 0
    WHEN ${officialSites.station_id} ILIKE ${containsPattern(text)} THEN 1
    WHEN ${permitNumberContains(text)} THEN 2
    ELSE 3
  END`;
}

function siteOrder(query: OfficialSiteListQuery, sort: OfficialSiteSort): SiteOrder {
  if (sort !== "relevance") return { ...createKeyset(sort, officialSites.id, SORT_COLUMNS, query.cursor), offset: query.offset ?? 0 };

  const offset = resolveOffset(query, OFFSET_LIMIT);
  const nextOffset = offset + query.limit;
  const newestFirst = desc(officialSites.id);
  return {
    orderBy: query.q === undefined ? [newestFirst] : [asc(siteTextRank(query.q)), newestFirst],
    key: sql<null>`NULL`,
    after: undefined,
    offset,
    cursorAfter: () => (nextOffset > OFFSET_LIMIT ? null : encodeCursor({ offset: nextOffset })),
  };
}

function siteListConditions(query: OfficialSiteListQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions: SQL[] = [];

  if (query.siteIds) conditions.push(inArray(officialSites.station_id, query.siteIds));
  if (query.stationIds) conditions.push(hasMatchingPermit(linkedToStations(officialPermits.id, query.stationIds, hiddenCountryCodes)));
  if (query.q) conditions.push(siteTextMatch(query.q));
  return conditions;
}

function siteParts(include: readonly OfficialSiteInclude[], permitCondition?: SQL): OfficialSiteParts {
  const wants = (name: OfficialSiteInclude) => include.includes(name);
  return {
    location: wants("location") || wants("location.region"),
    region: wants("location.region"),
    permits: wants("permits") || wants("permits.sectors"),
    sectors: wants("permits.sectors"),
    permitCondition,
  };
}

async function findVisibleOfficialSite(visibility: OfficialVisibility, siteId: number): Promise<OfficialSiteRows> {
  const [row] = await db
    .select(officialSiteRowColumns)
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(regions, eq(regions.id, officialLocations.region_id))
    .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
    .where(and(eq(officialSites.id, siteId), officialLocationIsPublic(officialLocations.id, visibility)))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function assertOfficialSiteVisible(req: FastifyRequest, siteId: number): Promise<void> {
  await findVisibleOfficialSite(await loadOfficialVisibility(req), siteId);
}

export async function readOfficialSite(req: FastifyRequest, siteId: number, include: readonly OfficialSiteInclude[]): Promise<OfficialSite> {
  const visibility = await loadOfficialVisibility(req);
  const parts = siteParts(include);
  const [row, relations] = await Promise.all([
    findVisibleOfficialSite(visibility, siteId),
    loadSiteRelations([siteId], parts, visibility.hiddenCountryCodes),
  ]);

  const [site] = toOfficialSites([row], parts, relations);
  return site!;
}

export async function fetchOfficialSitePage(req: FastifyRequest, query: OfficialSiteListQuery): Promise<OfficialSiteList> {
  const { include = [], limit, includeTotal } = query;
  const order = siteOrder(query, query.sort ?? (query.q === undefined ? "-id" : "relevance"));
  const [visibility, listedSiteIds] = await Promise.all([loadOfficialVisibility(req), listOfficialSiteIds(req, query.listId)]);
  const filters = and(
    ...officialAreaConditions(query, visibility),
    ...officialSiteConditions(query, listedSiteIds),
    ...siteListConditions(query, visibility.hiddenCountryCodes),
  );

  const [rows, totals] = await Promise.all([
    db
      .select({ ...officialSiteRowColumns, key: order.key })
      .from(officialSites)
      .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
      .innerJoin(regions, eq(regions.id, officialLocations.region_id))
      .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
      .where(and(filters, order.after))
      .orderBy(...order.orderBy)
      .limit(limit + 1)
      .offset(order.offset),
    includeTotal
      ? db
          .select({ total: count() })
          .from(officialSites)
          .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
          .innerJoin(regions, eq(regions.id, officialLocations.region_id))
          .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
          .where(filters)
      : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? order.cursorAfter({ id: last.site.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  const parts = siteParts(include, permitLabelCondition(query));
  return { data: await serializeSites(page, parts, visibility.hiddenCountryCodes), paging };
}
