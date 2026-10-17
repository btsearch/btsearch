import type { RouteOptions } from "fastify";
import { expect } from "vitest";

import { findDocumentationGap } from "../../src/features/openapi/document.js";
import { authBoundary, cacheInRedis, dbMock } from "./boundaries.js";
import { whereQuery } from "./mutationAssertions.js";

const importedAt = new Date("2026-10-01T00:00:00.000Z");
const changedAt = new Date("2026-10-10T00:00:00.000Z");

export const COUNTRY_VISIBILITY_KEY = "countries:v2:visibility";
export const SOURCE_VISIBILITY_KEY = "official:v3:source-visibility";

const IMPORTED_AT = importedAt.toISOString();
const CHANGED_AT = changedAt.toISOString();

export const regionRow = { id: 7, name: "Mazowieckie", code: "MAZ", countryCode: "PL", isoCode: "PL-14" };

const officialLocationRow = {
  id: 21,
  region_id: 7,
  city: "Warszawa",
  address: "ul. Prosta 1",
  longitude: 21.01,
  latitude: 52.23,
  source_id: 1,
  source_ref: null,
  updatedAt: changedAt,
  createdAt: importedAt,
};

const officialSiteRow = {
  id: 31,
  station_id: "BT12345",
  operator_id: 4,
  location_id: 21,
  source_id: 1,
  source_ref: null,
  updatedAt: changedAt,
  createdAt: importedAt,
};

export const officialPermitRow = {
  id: 41,
  official_site_id: 31,
  decision_number: "UKE/123/2026",
  decision_type: "permit_change",
  expiry_date: "2030-06-30",
  rat: "LTE",
  label_mhz: 800,
  label_variant: "commercial",
  updatedAt: changedAt,
  createdAt: importedAt,
};

export const officialSectorRow = { id: 51, permit_id: 41, azimuth: 360, elevation: 4, antenna_height: 32.5, antenna_type: "outdoor" };

export const officialLocationRows = { location: officialLocationRow, region: regionRow, sourceKey: "pl-uke" };
export const officialSiteRows = { ...officialLocationRows, site: officialSiteRow };
export const officialPermitRows = { ...officialSiteRows, permit: officialPermitRow };

export const servedLocation = {
  id: 21,
  sourceKey: "pl-uke",
  countryCode: "PL",
  regionId: 7,
  city: "Warszawa",
  address: "ul. Prosta 1",
  latitude: 52.23,
  longitude: 21.01,
  createdAt: IMPORTED_AT,
  updatedAt: CHANGED_AT,
};

export const servedSite = {
  id: 31,
  sourceKey: "pl-uke",
  siteId: "BT12345",
  operatorId: 4,
  locationId: 21,
  stationIds: [] as number[],
  createdAt: IMPORTED_AT,
  updatedAt: CHANGED_AT,
};

export const servedPermit = {
  id: 41,
  officialSiteId: 31,
  sourceKey: "pl-uke",
  number: "UKE/123/2026",
  kind: "permitChange",
  expiresOn: "2030-06-30",
  label: { rat: "lte", labelMhz: 800, variant: "commercial", name: "LTE 800" },
  datasets: [] as string[],
  createdAt: IMPORTED_AT,
  updatedAt: CHANGED_AT,
};

export const servedSector = { id: 51, azimuth: 360, elevation: 4, antennaHeightMeters: 32.5, antennaType: "outdoor" };

export function cacheCountryVisibility(hiddenCountryCodes: string[] = []): void {
  cacheInRedis(COUNTRY_VISIBILITY_KEY, [{ code: "PL", isVisible: true }, ...hiddenCountryCodes.map((code) => ({ code, isVisible: false }))]);
}

export function cacheSourceVisibility(sourceIds: number[] = [1], countryCode = "PL"): void {
  cacheInRedis(
    SOURCE_VISIBILITY_KEY,
    sourceIds.map((id) => ({ id, countryCode, isVisible: true, layers: ["sites", "microwave_links"] })),
  );
}

export function cacheSourcesOfTwoCountries(): void {
  cacheInRedis(SOURCE_VISIBILITY_KEY, [
    { id: 1, countryCode: "PL", isVisible: true, layers: ["sites", "microwave_links"] },
    { id: 2, countryCode: "XX", isVisible: true, layers: ["sites"] },
    { id: 3, countryCode: "PL", isVisible: false, layers: ["sites"] },
  ]);
}

export function scriptGuestVisibility(sourceIds: number[] = [1], hiddenCountryCodes: string[] = []): void {
  cacheCountryVisibility(hiddenCountryCodes);
  cacheSourceVisibility(sourceIds);
}

export function scriptUserVisibility(sourceIds: number[] = [1]): void {
  authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
  scriptGuestVisibility(sourceIds);
}

export function scriptAdminVisibility(): void {
  scriptGuestVisibility([]);
}

export function renderedWhere(table: string, position = 0): { sql: string; params: unknown[] } {
  const { sql, params } = whereQuery(table, "select", position);
  return { sql: sql.replace(/\s+/g, " "), params };
}

export function tablesRead(): string[] {
  return dbMock.calls.filter((call) => call.operation === "select").map((call) => call.table ?? "");
}

export function expectDocumented(route: { url: string; schema?: unknown; config?: unknown }): void {
  expect(findDocumentationGap(route as unknown as RouteOptions)).toBeUndefined();
  const statuses = Object.keys(((route.schema as { response?: object } | undefined)?.response ?? {}) as Record<string, unknown>).map(Number);
  expect(statuses.every((status) => status >= 200 && status < 300)).toBe(true);
}
