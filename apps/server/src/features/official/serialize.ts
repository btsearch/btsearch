import {
  officialDatasets,
  officialLocations,
  officialPermitListings,
  officialPermitSectors,
  officialPermits,
  officialSites,
  officialSources,
  regions,
  stations,
  stationsPermits,
} from "@openbts/drizzle";
import type {
  OfficialPermitKind,
  OfficialPermitLabel,
  OfficialPermitSector,
  OfficialRat,
  OfficialSite,
  OfficialSiteLocation,
  OfficialSitePermit,
} from "@openbts/shared/contract";
import { formatPermitLabel } from "@openbts/shared/permitLabel";
import { type SQL, type SQLWrapper, and, asc, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { type RegionRow, toRegion } from "../regions/serialize.js";
import { stationAreaConditions } from "../stations/read.js";

const locationSelectSchema = createSelectSchema(officialLocations);
const siteSelectSchema = createSelectSchema(officialSites);
const permitSelectSchema = createSelectSchema(officialPermits);
const sectorSelectSchema = createSelectSchema(officialPermitSectors);
const datasetSelectSchema = createSelectSchema(officialDatasets);

type OfficialLocationRow = Omit<z.infer<typeof locationSelectSchema>, "point">;
type OfficialSiteRow = z.infer<typeof siteSelectSchema>;
export type OfficialPermitRow = z.infer<typeof permitSelectSchema>;
type OfficialPermitSectorRow = z.infer<typeof sectorSelectSchema>;

export type OfficialLocationRows = { location: OfficialLocationRow; region: RegionRow; sourceKey: string };
export type OfficialSiteRows = OfficialLocationRows & { site: OfficialSiteRow };
export type OfficialPermitRows = OfficialSiteRows & { permit: OfficialPermitRow };
type SitePermitRows = { permit: OfficialPermitRow; sourceKey: string };
type PermitListingRow = { permitId: number; key: string; permitKind: DatasetPermitKind };
export type DatasetPermitKind = z.infer<typeof datasetSelectSchema>["permitKind"];
type SiteRelations = { stationIdsBySite: Map<number, number[]>; permitsBySite: Map<number, OfficialSitePermit[]> };

export type OfficialSiteParts = {
  location: boolean;
  region: boolean;
  permits: boolean;
  sectors: boolean;
  permitCondition?: SQL;
};

const RATS = { GSM: "gsm", CDMA: "cdma", UMTS: "umts", LTE: "lte", NR: "nr", IOT: "iot" } as const satisfies Record<
  NonNullable<OfficialPermitRow["rat"]>,
  OfficialRat
>;
const PERMIT_KINDS = { permit: "permit", permit_change: "permitChange" } as const satisfies Record<
  NonNullable<OfficialPermitRow["decision_type"]>,
  OfficialPermitKind
>;
export const DATASET_PERMIT_KINDS = {
  permit: "permit",
  registration: "registration",
  inventory: "inventory",
  environmental_permit: "environmentalPermit",
  certificate: "certificate",
  assessment: "assessment",
  licence: "license",
} as const satisfies Record<DatasetPermitKind, OfficialPermitKind>;

const officialLocationColumns = {
  id: officialLocations.id,
  region_id: officialLocations.region_id,
  city: officialLocations.city,
  address: officialLocations.address,
  longitude: officialLocations.longitude,
  latitude: officialLocations.latitude,
  precision_meters: officialLocations.precision_meters,
  source_id: officialLocations.source_id,
  source_ref: officialLocations.source_ref,
  updatedAt: officialLocations.updatedAt,
  createdAt: officialLocations.createdAt,
};

export const officialLocationRowColumns = { location: officialLocationColumns, region: regions, sourceKey: officialSources.key };
export const officialSiteRowColumns = { ...officialLocationRowColumns, site: officialSites };

export function toPermitKind(decisionType: NonNullable<OfficialPermitRow["decision_type"]>): OfficialPermitKind {
  return PERMIT_KINDS[decisionType];
}

function decisionOrDatasetKind(decisionType: OfficialPermitRow["decision_type"], listings: readonly PermitListingRow[]): OfficialPermitKind | null {
  if (decisionType !== null) return toPermitKind(decisionType);

  const [listing] = listings;
  return listing ? DATASET_PERMIT_KINDS[listing.permitKind] : null;
}

export function toOfficialPermitLabel(
  rat: OfficialPermitRow["rat"],
  labelMhz: OfficialPermitRow["label_mhz"],
  variant: OfficialPermitRow["label_variant"],
): OfficialPermitLabel {
  const name = rat !== null && labelMhz !== null && variant !== null ? formatPermitLabel({ rat, mhz: labelMhz, variant }) : null;
  return { rat: rat === null ? null : RATS[rat], labelMhz, variant, name };
}

function toOfficialPermitSector(row: OfficialPermitSectorRow): OfficialPermitSector {
  return { id: row.id, azimuth: row.azimuth, elevation: row.elevation, antennaHeightMeters: row.antenna_height, antennaType: row.antenna_type };
}

function toOfficialSitePermit({ permit, sourceKey }: SitePermitRows, listings: readonly PermitListingRow[]): OfficialSitePermit {
  return {
    id: permit.id,
    officialSiteId: permit.official_site_id,
    sourceKey,
    number: permit.decision_number,
    kind: decisionOrDatasetKind(permit.decision_type, listings),
    expiresOn: permit.expiry_date,
    label: toOfficialPermitLabel(permit.rat, permit.label_mhz, permit.label_variant),
    datasets: listings.map((listing) => listing.key),
    createdAt: permit.createdAt.toISOString(),
    updatedAt: permit.updatedAt.toISOString(),
  };
}

export function toOfficialSiteLocation({ location, region, sourceKey }: OfficialLocationRows, embedsRegion: boolean): OfficialSiteLocation {
  const serialized: OfficialSiteLocation = {
    id: location.id,
    sourceKey,
    countryCode: region.countryCode,
    regionId: location.region_id,
    city: location.city,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    precisionMeters: location.precision_meters,
    sourceRef: location.source_ref,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
  if (embedsRegion) serialized.region = toRegion(region);
  return serialized;
}

function groupIds(rows: readonly { ownerId: number; id: number }[]): Map<number, number[]> {
  const grouped = Map.groupBy(rows, (row) => row.ownerId);
  return new Map([...grouped].map(([ownerId, owned]) => [ownerId, unique(owned.map((row) => row.id))]));
}

async function loadSiteStationIds(siteIds: readonly number[], hiddenCountryCodes: readonly string[]): Promise<Map<number, number[]>> {
  if (siteIds.length === 0) return new Map();

  const rows = await db
    .select({ ownerId: officialPermits.official_site_id, id: stations.id })
    .from(stationsPermits)
    .innerJoin(officialPermits, eq(officialPermits.id, stationsPermits.permit_id))
    .innerJoin(stations, eq(stations.id, stationsPermits.station_id))
    .where(and(inArray(officialPermits.official_site_id, [...siteIds]), ...stationAreaConditions({}, hiddenCountryCodes)))
    .orderBy(eq(stations.status, "inactive"), asc(stations.id));
  return groupIds(rows);
}

export async function loadPermitStationIds(permitIds: readonly number[], hiddenCountryCodes: readonly string[]): Promise<Map<number, number[]>> {
  if (permitIds.length === 0) return new Map();

  const rows = await db
    .select({ ownerId: stationsPermits.permit_id, id: stations.id })
    .from(stationsPermits)
    .innerJoin(stations, eq(stations.id, stationsPermits.station_id))
    .where(and(inArray(stationsPermits.permit_id, [...permitIds]), ...stationAreaConditions({}, hiddenCountryCodes)))
    .orderBy(asc(stations.id));
  return groupIds(rows);
}

function loadPermitDetails(permitIds: readonly number[] | SQLWrapper, wantsSectors: boolean) {
  return Promise.all([
    db
      .select({ permitId: officialPermitListings.permitId, key: officialDatasets.key, permitKind: officialDatasets.permitKind })
      .from(officialPermitListings)
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialPermitListings.datasetId))
      .where(inArray(officialPermitListings.permitId, permitIds))
      .orderBy(asc(officialDatasets.key)),
    wantsSectors
      ? db.select().from(officialPermitSectors).where(inArray(officialPermitSectors.permit_id, permitIds)).orderBy(asc(officialPermitSectors.id))
      : [],
  ]);
}

function toSitePermits(
  rows: readonly SitePermitRows[],
  [listingRows, sectorRows]: Awaited<ReturnType<typeof loadPermitDetails>>,
  wantsSectors: boolean,
): OfficialSitePermit[] {
  const datasetsByPermit = Map.groupBy(listingRows, (row) => row.permitId);
  const sectorsByPermit = Map.groupBy(sectorRows, (row) => row.permit_id);

  return rows.map((row) => {
    const permit = toOfficialSitePermit(row, datasetsByPermit.get(row.permit.id) ?? []);
    if (wantsSectors) permit.sectors = (sectorsByPermit.get(row.permit.id) ?? []).map(toOfficialPermitSector);
    return permit;
  });
}

export async function serializeSitePermits(rows: readonly SitePermitRows[], wantsSectors: boolean): Promise<OfficialSitePermit[]> {
  if (rows.length === 0) return [];

  const details = await loadPermitDetails(
    rows.map((row) => row.permit.id),
    wantsSectors,
  );
  return toSitePermits(rows, details, wantsSectors);
}

async function loadSitePermits(siteIds: readonly number[], parts: OfficialSiteParts): Promise<OfficialSitePermit[]> {
  if (!parts.permits) return [];

  const ofSites = and(inArray(officialPermits.official_site_id, [...siteIds]), parts.permitCondition);
  const [permitRows, details] = await Promise.all([
    db
      .select({ permit: officialPermits, sourceKey: officialSources.key })
      .from(officialPermits)
      .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
      .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
      .where(ofSites)
      .orderBy(asc(officialPermits.id)),
    loadPermitDetails(db.select({ id: officialPermits.id }).from(officialPermits).where(ofSites), parts.sectors),
  ]);
  return toSitePermits(permitRows, details, parts.sectors);
}

export async function loadSiteRelations(
  siteIds: readonly number[],
  parts: OfficialSiteParts,
  hiddenCountryCodes: readonly string[],
): Promise<SiteRelations> {
  const [stationIdsBySite, permits] = await Promise.all([loadSiteStationIds(siteIds, hiddenCountryCodes), loadSitePermits(siteIds, parts)]);
  return { stationIdsBySite, permitsBySite: Map.groupBy(permits, (permit) => permit.officialSiteId) };
}

export function toOfficialSites(rows: readonly OfficialSiteRows[], parts: OfficialSiteParts, relations: SiteRelations): OfficialSite[] {
  return rows.map((row) => {
    const site: OfficialSite = {
      id: row.site.id,
      sourceKey: row.sourceKey,
      siteId: row.site.station_id,
      sourceRef: row.site.source_ref,
      operatorId: row.site.operator_id,
      locationId: row.site.location_id,
      stationIds: relations.stationIdsBySite.get(row.site.id) ?? [],
      createdAt: row.site.createdAt.toISOString(),
      updatedAt: row.site.updatedAt.toISOString(),
    };
    if (parts.location) site.location = toOfficialSiteLocation(row, parts.region);
    if (parts.permits) site.permits = relations.permitsBySite.get(row.site.id) ?? [];
    return site;
  });
}

export async function serializeSites(
  rows: readonly OfficialSiteRows[],
  parts: OfficialSiteParts,
  hiddenCountryCodes: readonly string[],
): Promise<OfficialSite[]> {
  if (rows.length === 0) return [];

  const relations = await loadSiteRelations(
    rows.map((row) => row.site.id),
    parts,
    hiddenCountryCodes,
  );
  return toOfficialSites(rows, parts, relations);
}
