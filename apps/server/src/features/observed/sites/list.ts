import { cellCopies, crowdSettings, groupEstimates, observedCells, observedSites, siteEstimates, siteGroups } from "@openbts/drizzle";
import type { Bbox, ObservedSiteList, ObservedSiteListQuery, Paging } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, count, eq, exists, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import { createKeyset } from "../../../lib/keyset.js";
import type { ActorAccess } from "../../access/access.js";
import { observedSiteInArea } from "../../access/filters.js";
import { outsideCountriesOf } from "../../operators/sharing.js";
import { bboxCondition } from "../../stations/read.js";
import { loadCellsOfSites } from "../cells/read.js";
import { type ObservedCellFilters, namesNetwork, observedCellConditions } from "../filters.js";
import { completeObservedSites } from "./read.js";
import { type ObservedSiteRow, type ObservedSiteSelection, SETTINGS_ROW_ID, selectObservedSites } from "./select.js";
import { toObservedSite } from "./serialize.js";
import { measuredBy } from "./visibility.js";

export const PUBLIC_SITES_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

export type SiteAudience = { kind: "public" } | { kind: "mine"; userId: string } | { kind: "staff"; access: ActorAccess | null };

const boxSettings = alias(crowdSettings, "box_settings");
const fittedMember = alias(siteGroups, "fitted_member");
const jointFit = alias(groupEstimates, "joint_fit");
const primaryCell = alias(observedCells, "primary_cell");
const copyCell = alias(observedCells, "copy_cell");

function fittedIn(bbox: Bbox) {
  const ownFits = db
    .select({ id: siteEstimates.observedSiteId })
    .from(siteEstimates)
    .innerJoin(boxSettings, and(eq(boxSettings.id, SETTINGS_ROW_ID), eq(boxSettings.publishedAlgorithmVersion, siteEstimates.algorithmVersion)))
    .where(bboxCondition(siteEstimates.point, bbox));
  const groupFits = db
    .select({ id: fittedMember.observedSiteId })
    .from(jointFit)
    .innerJoin(boxSettings, and(eq(boxSettings.id, SETTINGS_ROW_ID), eq(boxSettings.publishedAlgorithmVersion, jointFit.algorithmVersion)))
    .innerJoin(fittedMember, and(eq(fittedMember.leadSiteId, jointFit.leadSiteId), eq(fittedMember.algorithmVersion, jointFit.algorithmVersion)))
    .where(bboxCondition(jointFit.point, bbox));
  return ownFits.unionAll(groupFits);
}

function sitesNear(bbox: Bbox, includesCopies: boolean) {
  if (!includesCopies) return fittedIn(bbox);

  const copies = db
    .select({ id: sql<number>`${copyCell.observedSiteId}`.as("id") })
    .from(primaryCell)
    .innerJoin(cellCopies, eq(cellCopies.primaryCellId, primaryCell.id))
    .innerJoin(copyCell, eq(copyCell.id, cellCopies.observedCellId))
    .where(inArray(primaryCell.observedSiteId, fittedIn(bbox)));
  return fittedIn(bbox).unionAll(copies);
}

function withCell(conditions: readonly SQL[]): SQL {
  const cell = db
    .select({ id: observedCells.id })
    .from(observedCells)
    .where(and(eq(observedCells.observedSiteId, observedSites.id), ...conditions));
  return exists(cell);
}

function operatorCondition(operatorIds: readonly number[], codes: readonly string[], keepsOtherCountries: boolean, countryCode: SQLWrapper): SQL {
  const operated = sql`(${inArray(observedSites.plmn, [...codes])} OR ${withCell([namesNetwork(codes)])})`;
  return keepsOtherCountries ? sql`(${operated} OR ${outsideCountriesOf(countryCode, operatorIds)})` : operated;
}

function listConditions(query: ObservedSiteListQuery, filters: ObservedCellFilters, site: ObservedSiteSelection): SQL[] {
  const conditions: SQL[] = [isNull(observedSites.retiredAt), isNotNull(site.point)];
  const cellConditions = observedCellConditions({ ...filters, operatorCodes: null, includeCopies: true });
  const includesCopies = query.includeCopies === true;

  if (!includesCopies) conditions.push(isNull(site.copyOfSiteId));
  if (query.ids) conditions.push(inArray(observedSites.id, query.ids));
  if (query.bbox) conditions.push(inArray(observedSites.id, sitesNear(query.bbox, includesCopies)), bboxCondition(site.point, query.bbox));
  if (query.countryCodes) conditions.push(inArray(site.countryCode, query.countryCodes));
  if (query.regionIds) conditions.push(inArray(site.regionId, query.regionIds));
  if (query.statuses) conditions.push(inArray(site.status, query.statuses));
  if (query.minPeople !== undefined) conditions.push(gte(site.personCount, query.minPeople));
  if (query.operatorIds && filters.operatorCodes) {
    conditions.push(operatorCondition(query.operatorIds, filters.operatorCodes, query.keepOtherCountries === true, site.countryCode));
  }
  if (cellConditions.length > 0) conditions.push(withCell(cellConditions));
  return conditions;
}

function audienceCondition(audience: SiteAudience, site: ObservedSiteSelection): SQL | undefined {
  switch (audience.kind) {
    case "public":
      return site.isPublic;
    case "mine":
      return and(sql`NOT ${site.isPublic}`, site.isCountryShown, measuredBy(audience.userId, site));
    case "staff":
      return audience.access?.role === "admin" ? undefined : observedSiteInArea(audience.access?.grants ?? [], site.countryCode, site.regionId);
  }
}

export function selectListedSites(query: ObservedSiteListQuery, filters: ObservedCellFilters, audience: SiteAudience, after?: SQL) {
  const site = selectObservedSites();
  return site.query.where(and(...listConditions(query, filters, site), audienceCondition(audience, site), after));
}

async function fetchObservedSitePage(
  query: ObservedSiteListQuery,
  filters: ObservedCellFilters,
  audience: SiteAudience,
): Promise<{ rows: ObservedSiteRow[]; paging: Paging }> {
  const { sort, limit, cursor, includeTotal } = query;
  const keyset = createKeyset(sort, observedSites.id, { id: null }, cursor);

  const [rows, totals] = await Promise.all([
    selectListedSites(query, filters, audience, keyset.after)
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(selectListedSites(query, filters, audience).as("listed_site")) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.id, key: null }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return { rows: page, paging };
}

export async function listObservedSites(
  query: ObservedSiteListQuery,
  filters: ObservedCellFilters,
  audience: SiteAudience,
): Promise<ObservedSiteList> {
  const { rows, paging } = await fetchObservedSitePage(query, filters, audience);
  const [records, cells] = await Promise.all([
    completeObservedSites(rows),
    query.include?.includes("cells") ? loadCellsOfSites(rows.map((row) => row.id)) : null,
  ]);
  const view = audience.kind === "staff" ? "staff" : "public";
  return { data: records.map((site) => toObservedSite(site, cells?.get(site.id), view)), paging };
}
