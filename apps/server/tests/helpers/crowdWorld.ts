import {
  bands,
  cellMatches,
  cells,
  contributorMonths,
  contributors,
  countries,
  crowdSettings,
  locations,
  lteCells,
  observedCellSummaries,
  observedCells,
  observedSites,
  operators,
  regionBoundaries,
  regionLookup,
  regions,
  roleGrantRegions,
  roleGrants,
  siteEstimates,
  stations,
  users,
} from "@openbts/drizzle";
import { COUNTRY_TOOLS } from "@openbts/shared/contract";
import type { CountryTool } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { DbTx } from "../../src/types/global.js";

export type Place = readonly [longitude: number, latitude: number];
export type Outline = readonly [west: number, south: number, east: number, north: number];
type CountryOptions = { isVisible?: boolean; observationsPublic?: boolean; tools?: CountryTool[] };
type Grant = { countryCode: string; role: "editor" | "maintainer"; isCountryWide: boolean; regionIds?: number[] };
type Contributor = { username?: string; isPublic?: boolean; listedAt?: Date | null };
type ContributorMonth = { userId: string; countryCode: string; month: string; samples?: number; newSquares?: number };
type ObservedCellOptions = {
  plmn: string;
  cellKey: number;
  observedSiteId: number | null;
  rat?: "LTE" | "NR" | "GSM";
  seen?: [string, string] | null;
};

let lastKey = 0;

function nextKey(): number {
  lastKey += 1;
  return lastKey;
}

export function added<T>(rows: readonly T[], what: string): T {
  const [row] = rows;
  if (row === undefined) throw new Error(`${what} was not added`);
  return row;
}

export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function addCountry(
  tx: DbTx,
  code: string,
  { isVisible = true, observationsPublic = true, tools = [...COUNTRY_TOOLS] }: CountryOptions = {},
): Promise<void> {
  await tx.insert(countries).values({ code, isVisible, observationsPublic, tools });
}

export async function addRegion(tx: DbTx, countryCode: string, outline?: Outline): Promise<number> {
  const key = nextKey();
  const { id } = added(
    await tx
      .insert(regions)
      .values({ name: `Crowd test region ${key}`, code: `T${key}`, countryCode, isoCode: `${countryCode}-T${key}` })
      .returning({ id: regions.id }),
    "The region",
  );
  if (outline === undefined) return id;

  const shape = sql`ST_MakeEnvelope(${outline[0]}, ${outline[1]}, ${outline[2]}, ${outline[3]}, 4326)`;
  await tx.insert(regionBoundaries).values({ regionId: id, geom: sql`ST_Multi(${shape})`, source: "crowd test" });
  await tx.insert(regionLookup).values({ regionId: id, geom: shape });
  return id;
}

export async function addOperator(tx: DbTx, countryCode: string, mnc: number): Promise<number> {
  const operator = added(
    await tx
      .insert(operators)
      .values({ name: `Crowd Test ${mnc}`, full_name: `Crowd Test ${mnc} S.A.`, countryCode, mnc })
      .returning({ id: operators.id }),
    "The operator",
  );
  return operator.id;
}

export async function addStation(
  tx: DbTx,
  {
    operatorId,
    regionId,
    at,
    status = "published",
  }: { operatorId: number; regionId: number; at: Place; status?: "published" | "pending" | "inactive" },
): Promise<number> {
  const location = added(
    await tx.insert(locations).values({ region_id: regionId, longitude: at[0], latitude: at[1] }).returning({ id: locations.id }),
    "The location",
  );
  const station = added(
    await tx
      .insert(stations)
      .values({ station_id: `CT${nextKey()}`, operator_id: operatorId, location_id: location.id, status })
      .returning({ id: stations.id }),
    "The station",
  );
  return station.id;
}

export async function addLteBand(tx: DbTx): Promise<number> {
  const key = nextKey();
  const band = added(
    await tx
      .insert(bands)
      .values({ rat: "LTE", name: `CT LTE ${key}`, value: 90_000 + key, duplex: "FDD" })
      .returning({ id: bands.id }),
    "The band",
  );
  return band.id;
}

export async function addLteCell(
  tx: DbTx,
  { stationId, bandId, enbid, clid, pci = null }: { stationId: number; bandId: number; enbid: number; clid: number; pci?: number | null },
): Promise<number> {
  const cell = added(await tx.insert(cells).values({ station_id: stationId, band_id: bandId, rat: "LTE" }).returning({ id: cells.id }), "The cell");
  await tx.insert(lteCells).values({ cell_id: cell.id, enbid, clid, pci });
  return cell.id;
}

export async function addObservedSite(tx: DbTx, plmn: string, nodeId: number, rat: "LTE" | "NR" = "LTE"): Promise<number> {
  const site = added(await tx.insert(observedSites).values({ plmn, rat, nodeId }).returning({ id: observedSites.id }), "The observed site");
  return site.id;
}

export async function addObservedCell(
  tx: DbTx,
  { plmn, cellKey, observedSiteId, rat = "LTE", seen = ["2099-01-10", "2099-01-12"] }: ObservedCellOptions,
): Promise<number> {
  const cell = added(
    await tx.insert(observedCells).values({ plmn, rat, cellKey, observedSiteId }).returning({ id: observedCells.id }),
    "The observed cell",
  );
  if (seen !== null) {
    await tx
      .insert(observedCellSummaries)
      .values({ observedCellId: cell.id, sampleCount: 50, contributorCount: 2, personCount: 2, firstSeenOn: seen[0], lastSeenOn: seen[1] });
  }
  return cell.id;
}

export async function matchObservedCell(tx: DbTx, observedCellId: number, cellId: number): Promise<void> {
  await tx.insert(cellMatches).values({ observedCellId, kind: "cell", networkMatch: "own", cellId });
}

export async function estimateSite(tx: DbTx, observedSiteId: number, [longitude, latitude]: Place): Promise<void> {
  await tx.update(crowdSettings).set({ publishedAlgorithmVersion: 1, publicRadiusMaxM: 1000 }).where(eq(crowdSettings.id, 1));
  await tx.insert(siteEstimates).values({
    observedSiteId,
    algorithmVersion: 1,
    point: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`,
    uncertaintyM: 200,
    ellipseMajorM: 240,
    ellipseMinorM: 150,
    ellipseAzimuthDeg: 35,
    isConsistent: true,
    sampleCount: 1000,
    contributorCount: 3,
    personCount: 2,
    binCount: 60,
    taSampleCount: 400,
    angularCoverageDeg: 230,
    distinctDays: 6,
    maxDistanceM: 3500,
    evidenceClass: "coarseTaPeople",
    ellipseScale: 1.5,
  });
}

export async function addUser(tx: DbTx, role: "user" | "editor" | "admin" = "user"): Promise<string> {
  const user = added(
    await tx
      .insert(users)
      .values({ email: `${randomUUID()}@crowd-test.invalid`, name: "Crowd test", role })
      .returning({ id: users.id }),
    "The user",
  );
  return user.id;
}

export async function addContributingPerson(
  tx: DbTx,
  { username = `crowd-${randomUUID().slice(0, 12)}`, isPublic = true, listedAt = null }: Contributor = {},
): Promise<string> {
  const user = added(
    await tx
      .insert(users)
      .values({ email: `${randomUUID()}@crowd-test.invalid`, name: username, username, profileVisibility: isPublic ? "public" : "private" })
      .returning({ id: users.id }),
    "The person",
  );
  await tx.insert(contributors).values({ userId: user.id, listedAt });
  return user.id;
}

export async function addContributorMonth(tx: DbTx, { userId, countryCode, month, samples = 100, newSquares = 0 }: ContributorMonth): Promise<void> {
  await tx.insert(contributorMonths).values({ userId, countryCode, month, sampleCount: samples, newSquares });
}

export async function addGrant(tx: DbTx, userId: string, { countryCode, role, isCountryWide, regionIds = [] }: Grant): Promise<void> {
  const grant = added(await tx.insert(roleGrants).values({ userId, role, countryCode, isCountryWide }).returning({ id: roleGrants.id }), "The grant");
  if (regionIds.length > 0) await tx.insert(roleGrantRegions).values(regionIds.map((regionId) => ({ grantId: grant.id, regionId })));
}
