import { cellContributors, crowdSettings, devices, observedCells, observedSites, siteCopies, siteGroups } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, and, countDistinct, eq, exists, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import type { EditorGrant } from "../../access/access.js";
import { observedSiteInArea } from "../../access/filters.js";
import type { ObservedSiteRecord } from "./read.js";
import { type ObservedSiteSelection, SETTINGS_ROW_ID, selectObservedSites } from "./select.js";

const measuringCell = alias(observedCells, "measuring_cell");
const measuringGroup = alias(siteGroups, "measuring_group");
const measuringSettings = alias(crowdSettings, "measuring_settings");

function selectMeasuredSites(userId: string) {
  return db
    .selectDistinct({ id: sql<number>`coalesce(${siteCopies.primarySiteId}, ${measuringCell.observedSiteId})`.as("measured_site_id") })
    .from(cellContributors)
    .innerJoin(devices, and(eq(devices.id, cellContributors.deviceId), eq(devices.userId, userId)))
    .innerJoin(measuringCell, eq(measuringCell.id, cellContributors.observedCellId))
    .leftJoin(siteCopies, eq(siteCopies.observedSiteId, measuringCell.observedSiteId))
    .where(isNotNull(measuringCell.observedSiteId));
}

function selectMeasuredGroups(userId: string) {
  const isPublished = and(
    eq(measuringSettings.id, SETTINGS_ROW_ID),
    eq(measuringSettings.publishedAlgorithmVersion, measuringGroup.algorithmVersion),
  );
  return db
    .select({ id: measuringGroup.leadSiteId })
    .from(measuringGroup)
    .innerJoin(measuringSettings, isPublished)
    .where(inArray(measuringGroup.observedSiteId, selectMeasuredSites(userId)));
}

export function measuredBy(userId: string, site: ObservedSiteSelection): SQL {
  return sql`(${inArray(site.primarySiteId, selectMeasuredSites(userId))} OR ${inArray(site.leadSiteId, selectMeasuredGroups(userId))})`;
}

function measurableSiteIds(site: ObservedSiteRecord): number[] {
  return [site.primarySiteId, ...(site.group?.memberSiteIds ?? [])];
}

export async function findSitesMeasuredBy(userId: string, sites: readonly ObservedSiteRecord[]): Promise<Set<number>> {
  if (sites.length === 0) return new Set();

  const measured = selectMeasuredSites(userId).as("measured");
  const rows = await db
    .select({ id: measured.id })
    .from(measured)
    .where(inArray(measured.id, unique(sites.flatMap(measurableSiteIds))));
  const measuredIds = new Set(rows.map((row) => row.id));
  return new Set(sites.filter((site) => measurableSiteIds(site).some((id) => measuredIds.has(id))).map((site) => site.id));
}

export function observedSiteIdInArea(grants: readonly EditorGrant[], observedSiteId: SQLWrapper): SQL {
  const site = selectObservedSites();
  return exists(site.query.where(and(eq(observedSites.id, observedSiteId), observedSiteInArea(grants, site.countryCode, site.regionId))));
}

export function observedSiteIsPublic(observedSiteId: SQLWrapper): SQL {
  const site = selectObservedSites();
  return exists(site.query.where(and(eq(observedSites.id, observedSiteId), site.isPublic)));
}

export function observedSiteMeasuredBy(userId: string, observedSiteId: SQLWrapper): SQL {
  const site = selectObservedSites();
  return exists(site.query.where(and(eq(observedSites.id, observedSiteId), site.isCountryShown, measuredBy(userId, site))));
}

export function selectPublicSiteIds() {
  const site = selectObservedSites();
  const publicSite = site.query.where(site.isPublic).as("public_site");
  return db.select({ id: publicSite.siteId }).from(publicSite);
}

export function selectPublicSiteTotals() {
  const site = selectObservedSites();
  const publicSite = site.query.where(and(site.isPublic, isNull(site.copyOfSiteId))).as("public_site");
  return db
    .select({ countryCode: publicSite.networkCountryCode, status: publicSite.siteStatus, sites: countDistinct(publicSite.siteKey) })
    .from(publicSite)
    .groupBy(publicSite.networkCountryCode, publicSite.siteStatus);
}
