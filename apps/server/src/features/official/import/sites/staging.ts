import type { ReadContext, SiteRecord, SitesDataset } from "@openbts/country-packs/sources";
import { BandVariant, OfficialDecisionType, officialPermitListings, ratEnum, regions } from "@openbts/drizzle";
import { type SQL, and, count, eq, inArray, sql } from "drizzle-orm";
import { date, doublePrecision, integer, jsonb, pgSchema, text, varchar } from "drizzle-orm/pg-core";

import { chunks, unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import {
  DECISION_NUMBER_MAX_LENGTH,
  REPORTED_NAMES_LIMIT,
  SITE_CODE_MAX_LENGTH,
  STAGING_BATCH_SIZE,
  STAGING_IO_CONCURRENCY,
  STAGING_WORK_MEM,
} from "../config.js";
import { type ResolvedLicensee, resolveLicensees } from "../licensees.js";
import { type SkipCounts, countSkip } from "../skips.js";
import type { ReleaseInput, SliceCount } from "../types.js";

type StagedSector = { azimuth: number | null; elevation: number | null; antenna_height: number | null; antenna_type: string | null };
type PublishedLine = { ordinal: number; sectors: StagedSector[] };
type FirstSiteName = { name: string; ordinal: number };
type PublishedPermit = { first: SiteRecord; ordinal: number; lines: PublishedLine[]; siteName: FirstSiteName | null };
type LocatedPermit = PublishedPermit & { regionId: number };
type MappedPermit = LocatedPermit & { licenseeId: number; operatorId: number };
type StagedPermitRow = {
  ordinal: number;
  slice: string;
  longitude: number;
  latitude: number;
  city: string | null;
  address: string | null;
  region_id: number;
  site_code: string;
  licensee_id: number;
  operator_id: number;
  site_name: string | null;
  site_name_ordinal: number | null;
  rat: string;
  label_mhz: number;
  label_variant: string;
  decision_number: string;
  decision_type: string;
  expiry_date: string | null;
  sectors: StagedSector[];
};

const KNOWN_RATS: ReadonlySet<string> = new Set(ratEnum.enumValues);

export const stagedPermits = pgSchema("pg_temp").table("official_import_staged_permits", {
  ordinal: integer("ordinal").notNull(),
  slice: varchar("slice", { length: 64 }).notNull(),
  longitude: doublePrecision("longitude").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  city: text("city"),
  address: text("address"),
  regionId: integer("region_id").notNull(),
  siteCode: text("site_code").notNull(),
  licenseeId: integer("licensee_id").notNull(),
  operatorId: integer("operator_id").notNull(),
  siteName: text("site_name"),
  siteNameOrdinal: integer("site_name_ordinal"),
  rat: ratEnum("rat").notNull(),
  labelMhz: integer("label_mhz").notNull(),
  labelVariant: BandVariant("label_variant").notNull(),
  decisionNumber: text("decision_number").notNull(),
  decisionType: OfficialDecisionType("decision_type").notNull(),
  expiryDate: date("expiry_date", { mode: "string" }),
  sectors: jsonb("sectors").$type<StagedSector[]>().notNull(),
  locationId: integer("location_id"),
  officialSiteId: integer("official_site_id"),
  permitId: integer("permit_id"),
});

export function siteRecordProblem(record: SiteRecord): string | null {
  if (Array.from(record.site.siteId).length > SITE_CODE_MAX_LENGTH) return "site_id_too_long";
  if (Array.from(record.permit.number).length > DECISION_NUMBER_MAX_LENGTH) return "decision_number_too_long";

  const { rat, mhz } = record.permit.label;
  return KNOWN_RATS.has(rat) && Number.isInteger(mhz) && mhz > 0 ? null : "bad_label";
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function stagedSectorsOf(record: SiteRecord): StagedSector[] {
  return record.sectors.map((sector) => ({
    azimuth: finiteOrNull(sector.azimuth),
    elevation: finiteOrNull(sector.elevation),
    antenna_height: sector.antennaHeight,
    antenna_type: sector.antennaPlacement,
  }));
}

function placeKeyOf({ location }: SiteRecord): string {
  return JSON.stringify([location.longitude, location.latitude, location.regionIsoCode]);
}

function permitKeyPerLicenseeName({ slice, location, site, permit }: SiteRecord): string {
  const { rat, mhz, variant } = permit.label;
  return JSON.stringify([
    slice,
    site.siteId,
    site.licensee,
    location.longitude,
    location.latitude,
    location.regionIsoCode,
    rat,
    mhz,
    variant,
    permit.number,
    permit.decisionType,
    permit.expiresOn,
  ]);
}

function permitKeyPerOperator({ first: { slice, location, site, permit }, operatorId }: MappedPermit): string {
  const { rat, mhz, variant } = permit.label;
  return JSON.stringify([
    slice,
    site.siteId,
    operatorId,
    location.longitude,
    location.latitude,
    rat,
    mhz,
    variant,
    permit.number,
    permit.decisionType,
    permit.expiresOn,
  ]);
}

function addPublishedLine(permits: Map<string, PublishedPermit>, record: SiteRecord, ordinal: number): void {
  const key = permitKeyPerLicenseeName(record);
  const known = permits.get(key);
  const permit: PublishedPermit = known ?? { first: record, ordinal, lines: [], siteName: null };
  if (!known) permits.set(key, permit);

  permit.lines.push({ ordinal, sectors: stagedSectorsOf(record) });
  const { name } = record.site;
  if (permit.siteName === null && name !== null && name !== "") permit.siteName = { name, ordinal };
}

async function readPublishedPermits(
  { dataset, release, files }: ReleaseInput,
  definition: SitesDataset,
  context: ReadContext,
  skips: SkipCounts,
): Promise<PublishedPermit[]> {
  const permits = new Map<string, PublishedPermit>();
  let ordinal = 0;

  for await (const record of definition.parse(context, release, files)) {
    if (!release.coveredSlices.includes(record.slice)) {
      throw new Error(`The reader of ${dataset.key} gave a record of the slice "${record.slice}", which its release does not cover`);
    }

    const problem = siteRecordProblem(record);
    if (problem !== null) {
      countSkip(skips, record.slice, problem);
      continue;
    }

    addPublishedLine(permits, record, ordinal);
    ordinal += 1;
  }

  return [...permits.values()];
}

async function readRegionIds(tx: DbTx, permits: readonly PublishedPermit[]): Promise<Map<string, number | null>> {
  const locations = new Map(permits.map(({ first }) => [placeKeyOf(first), first.location]));
  const places = [...locations.values()].map(({ longitude, latitude, regionIsoCode }, id) => ({
    id,
    longitude,
    latitude,
    region_iso_code: regionIsoCode,
  }));
  const resolved = await tx.execute<{ id: number; regionId: number | null }>(sql`
    SELECT place.id, COALESCE(region_at(place.longitude, place.latitude, claimed.id), claimed.id) AS "regionId"
    FROM jsonb_to_recordset(${JSON.stringify(places)}::jsonb)
      AS place (id integer, longitude double precision, latitude double precision, region_iso_code text)
    LEFT JOIN ${regions} AS claimed ON claimed.iso_code = place.region_iso_code
  `);
  const regionIdOfPlace = new Map(resolved.map((place) => [place.id, place.regionId]));

  return new Map([...locations.keys()].map((key, id) => [key, regionIdOfPlace.get(id) ?? null]));
}

function locatedPermitsOf(permits: readonly PublishedPermit[], regionIds: ReadonlyMap<string, number | null>, skips: SkipCounts): LocatedPermit[] {
  return permits.flatMap((permit) => {
    const regionId = regionIds.get(placeKeyOf(permit.first)) ?? null;
    if (regionId !== null) return [{ ...permit, regionId }];

    countSkip(skips, permit.first.slice, "unknown_region", permit.lines.length);
    return [];
  });
}

async function readOrderedLicenseeNames(tx: DbTx, permits: readonly LocatedPermit[]): Promise<string[]> {
  const names = unique(permits.map(({ first }) => first.site.licensee));
  const ordered = await tx.execute<{ licensee: string }>(sql`
    SELECT published.licensee FROM jsonb_array_elements_text(${JSON.stringify(names)}::jsonb) AS published (licensee) ORDER BY published.licensee
  `);
  return ordered.map((row) => row.licensee);
}

function mappedPermitsOf(permits: readonly LocatedPermit[], licensees: ReadonlyMap<string, ResolvedLicensee>, skips: SkipCounts): MappedPermit[] {
  return permits.flatMap((permit) => {
    const licensee = licensees.get(permit.first.site.licensee);
    const operatorId = licensee?.operatorId ?? null;
    if (licensee !== undefined && operatorId !== null) return [{ ...permit, licenseeId: licensee.licenseeId, operatorId }];

    countSkip(skips, permit.first.slice, "unmapped_licensee", permit.lines.length);
    return [];
  });
}

export function unmappedNamesOf(publishedNames: readonly string[], resolved: ReadonlyMap<string, ResolvedLicensee>): string[] {
  return publishedNames.filter((name) => (resolved.get(name)?.operatorId ?? null) === null);
}

function logUnmappedLicensees({ scope, dataset, release }: ReleaseInput, names: readonly string[]): void {
  if (names.length === 0) return;

  logger.info("official.import.unmapped_licensees", {
    runId: scope.run.id,
    source: scope.source.key,
    dataset: dataset.key,
    slices: release.coveredSlices,
    total: names.length,
    names: names.slice(0, REPORTED_NAMES_LIMIT),
  });
}

function earlierSiteName(first: FirstSiteName | null, second: FirstSiteName | null): FirstSiteName | null {
  if (first === null || second === null) return first ?? second;
  return second.ordinal < first.ordinal ? second : first;
}

function withLaterLines(earlier: MappedPermit, later: MappedPermit): MappedPermit {
  return {
    ...earlier,
    lines: [...earlier.lines, ...later.lines].toSorted((first, second) => first.ordinal - second.ordinal),
    siteName: earlierSiteName(earlier.siteName, later.siteName),
  };
}

function stagedRowOf({ first, ordinal, lines, siteName, regionId, licenseeId, operatorId }: MappedPermit): StagedPermitRow {
  const { slice, location, site, permit } = first;
  return {
    ordinal,
    slice,
    longitude: location.longitude,
    latitude: location.latitude,
    city: location.city,
    address: location.address,
    region_id: regionId,
    site_code: site.siteId,
    licensee_id: licenseeId,
    operator_id: operatorId,
    site_name: siteName?.name ?? null,
    site_name_ordinal: siteName?.ordinal ?? null,
    rat: permit.label.rat,
    label_mhz: permit.label.mhz,
    label_variant: permit.label.variant,
    decision_number: permit.number,
    decision_type: permit.decisionType,
    expiry_date: permit.expiresOn,
    sectors: lines.flatMap((line) => line.sectors),
  };
}

function stagedRowsOf(permits: readonly MappedPermit[]): StagedPermitRow[] {
  const merged = new Map<string, MappedPermit>();
  for (const permit of permits) {
    const key = permitKeyPerOperator(permit);
    const earlier = merged.get(key);
    merged.set(key, earlier ? withLaterLines(earlier, permit) : permit);
  }

  return [...merged.values()].map(stagedRowOf);
}

async function resolveStagedRows(tx: DbTx, input: ReleaseInput, permits: readonly PublishedPermit[], skips: SkipCounts): Promise<StagedPermitRow[]> {
  const { scope } = input;
  const located = locatedPermitsOf(permits, await readRegionIds(tx, permits), skips);
  const publishedNames = await readOrderedLicenseeNames(tx, located);
  const licensees = await resolveLicensees(tx, scope.run.sourceId, scope.source, publishedNames, { addsUnmapped: false });
  logUnmappedLicensees(input, unmappedNamesOf(publishedNames, licensees));

  return stagedRowsOf(mappedPermitsOf(located, licensees, skips));
}

async function openStagingTable(tx: DbTx): Promise<void> {
  await tx.execute(sql`SET LOCAL effective_io_concurrency = ${sql.raw(String(STAGING_IO_CONCURRENCY))}`);
  await tx.execute(sql`SET LOCAL work_mem = ${sql.raw(`'${STAGING_WORK_MEM}'`)}`);
  await tx.execute(sql`
    DO $create$
    BEGIN
      IF to_regclass('${stagedPermits}') IS NULL THEN
        CREATE TEMPORARY TABLE ${stagedPermits} (
          ordinal integer NOT NULL,
          slice varchar(64) NOT NULL,
          longitude double precision NOT NULL,
          latitude double precision NOT NULL,
          city text,
          address text,
          region_id integer NOT NULL,
          site_code text NOT NULL,
          licensee_id integer NOT NULL,
          operator_id integer NOT NULL,
          site_name text,
          site_name_ordinal integer,
          rat rat NOT NULL,
          label_mhz integer NOT NULL,
          label_variant band_variant NOT NULL,
          decision_number text NOT NULL,
          decision_type official_decision_type NOT NULL,
          expiry_date date,
          sectors jsonb NOT NULL,
          location_id integer,
          official_site_id integer,
          permit_id integer
        ) ON COMMIT DROP;
      END IF;
    END
    $create$
  `);
  await tx.execute(sql`TRUNCATE ${stagedPermits}`);
}

async function stageRows(tx: DbTx, rows: readonly StagedPermitRow[]): Promise<void> {
  await tx.execute(sql`
    INSERT INTO ${stagedPermits}
      (ordinal, slice, longitude, latitude, city, address, region_id, site_code, licensee_id, operator_id, site_name, site_name_ordinal,
       rat, label_mhz, label_variant, decision_number, decision_type, expiry_date, sectors)
    SELECT incoming.ordinal, incoming.slice, incoming.longitude, incoming.latitude, incoming.city, incoming.address, incoming.region_id,
      incoming.site_code, incoming.licensee_id, incoming.operator_id, incoming.site_name, incoming.site_name_ordinal, incoming.rat,
      incoming.label_mhz, incoming.label_variant, incoming.decision_number, incoming.decision_type, incoming.expiry_date, incoming.sectors
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS incoming (
      ordinal integer, slice varchar(64), longitude double precision, latitude double precision, city text, address text, region_id integer,
      site_code text, licensee_id integer, operator_id integer, site_name text, site_name_ordinal integer, rat rat, label_mhz integer,
      label_variant band_variant, decision_number text, decision_type official_decision_type, expiry_date date, sectors jsonb
    )
  `);
}

export function sliceListOf(slices: readonly string[]): SQL {
  return sql.join(
    slices.map((slice) => sql`${slice}`),
    sql`, `,
  );
}

export async function dropStagedSlices(tx: DbTx, slices: readonly string[]): Promise<void> {
  await tx.delete(stagedPermits).where(inArray(stagedPermits.slice, [...slices]));
}

async function analyzeStaged(tx: DbTx): Promise<void> {
  await tx.execute(sql`ANALYZE ${stagedPermits}`);
}

export async function countLiveListings(tx: DbTx, datasetId: number, slices: readonly string[]): Promise<Map<string, number>> {
  const rows = await tx
    .select({ slice: officialPermitListings.slice, listings: count() })
    .from(officialPermitListings)
    .where(and(eq(officialPermitListings.datasetId, datasetId), inArray(officialPermitListings.slice, [...slices])))
    .groupBy(officialPermitListings.slice);

  return new Map(rows.map((row) => [row.slice, row.listings]));
}

export async function stageSites(
  tx: DbTx,
  input: ReleaseInput,
  definition: SitesDataset,
  context: ReadContext,
  skips: SkipCounts,
): Promise<SliceCount[]> {
  const { dataset, release } = input;
  const rows = await resolveStagedRows(tx, input, await readPublishedPermits(input, definition, context, skips), skips);
  await openStagingTable(tx);
  // eslint-disable-next-line no-await-in-loop
  for (const batch of chunks(rows, STAGING_BATCH_SIZE)) await stageRows(tx, batch);
  await analyzeStaged(tx);

  const rowsBySlice = Map.groupBy(rows, (row) => row.slice);
  const liveCounts = await countLiveListings(tx, dataset.id, release.coveredSlices);
  return release.coveredSlices.map((slice) => ({ slice, stagedCount: rowsBySlice.get(slice)?.length ?? 0, liveCount: liveCounts.get(slice) ?? 0 }));
}
