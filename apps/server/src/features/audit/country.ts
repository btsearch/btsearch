import { auditLogs, auditOperations, locations, operators, proposedLocations, proposedStations, regions, submissions } from "@openbts/drizzle";
import type { AuditEntity } from "@openbts/shared/audit";
import { type SQL, type SQLWrapper, asc, eq, inArray, sql } from "drizzle-orm";

import { chunks, unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { logger } from "../../utils/logger.js";
import { stationCountries, stationCountryCode } from "../stations/country.js";

type Reader = Pick<DbTx, "select">;
type SnapshotEntry = { operationId: number; entity: AuditEntity; stationId: number | null; recordId: string | null; snapshots: unknown[] };
type SubmissionPlace = { stationId: number | null; proposedCountryCode: string | null };
type CountryLookups = {
  stations: Map<number, string | null>;
  locations: Map<number, string | null>;
  regions: Map<number, string | null>;
  operators: Map<number, string | null>;
  submissions: Map<string, SubmissionPlace>;
};

const LOOKUP_BATCH_SIZE = 5000;

function valueAt(snapshot: unknown, ...path: string[]): unknown {
  let value = snapshot;
  for (const key of path) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function idAt(snapshot: unknown, ...path: string[]): number | null {
  const value = valueAt(snapshot, ...path);
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function idsAt(snapshots: readonly unknown[], ...path: string[]): number[] {
  return unique(snapshots.map((snapshot) => idAt(snapshot, ...path)));
}

function entryStationIds(entry: SnapshotEntry): number[] {
  return unique([entry.stationId, ...idsAt(entry.snapshots, "station_id")]);
}

function entrySubmissionIds(entry: SnapshotEntry): string[] {
  if (entry.entity === "submissions") return unique([entry.recordId]);
  if (entry.entity !== "submission_photos") return [];

  return unique(
    entry.snapshots.map((snapshot) => {
      const submissionId = valueAt(snapshot, "submission_id");
      return typeof submissionId === "string" ? submissionId : null;
    }),
  );
}

function ownCountryCodes(entry: SnapshotEntry): (string | null)[] {
  return entry.snapshots.map((snapshot) => {
    const countryCode = valueAt(snapshot, "countryCode");
    return typeof countryCode === "string" ? countryCode : null;
  });
}

function entryCountries(entry: SnapshotEntry, lookups: CountryLookups, regionIdsByLocation: ReadonlyMap<number, number[]>): (string | null)[] {
  const stationCountry = (stationId: number) => lookups.stations.get(stationId) ?? null;
  const regionCountry = (regionId: number) => lookups.regions.get(regionId) ?? null;
  const operatorCountry = (operatorId: number) => lookups.operators.get(operatorId) ?? null;
  const submissionCountry = (submissionId: string) => {
    const place = lookups.submissions.get(submissionId);
    if (!place) return null;
    return place.stationId === null ? place.proposedCountryCode : stationCountry(place.stationId);
  };

  switch (entry.entity) {
    case "stations": {
      const placed = entry.snapshots.map((snapshot) => {
        const locationId = idAt(snapshot, "location_id");
        const locationCountry = locationId === null ? undefined : lookups.locations.get(locationId);
        if (locationCountry !== undefined) return locationCountry;

        const operatorId = idAt(snapshot, "operator_id");
        return operatorId === null ? null : operatorCountry(operatorId);
      });
      const live = entry.stationId === null ? undefined : lookups.stations.get(entry.stationId);
      return live === undefined ? placed : [live, ...placed];
    }
    case "cells":
    case "station_sectors":
    case "extra_identificators":
    case "station_uplinks":
    case "station_photo_selections":
    case "station_comments":
      return entryStationIds(entry).map(stationCountry);
    case "location_photos": {
      const ofLocations = idsAt(entry.snapshots, "location_id").flatMap((locationId): (string | null)[] => {
        const live = lookups.locations.get(locationId);
        if (live !== undefined) return [live];

        const regionIds = regionIdsByLocation.get(locationId) ?? [];
        return regionIds.length === 0 ? [null] : regionIds.map(regionCountry);
      });
      return entry.stationId === null ? ofLocations : [...ofLocations, stationCountry(entry.stationId)];
    }
    case "submissions": {
      const placed = [...entryStationIds(entry).map(stationCountry), ...idsAt(entry.snapshots, "proposedLocation", "region_id").map(regionCountry)];
      if (placed.length > 0) return placed;

      const proposedOperators = idsAt(entry.snapshots, "proposedStation", "operator_id").map(operatorCountry);
      return proposedOperators.length > 0 ? proposedOperators : entrySubmissionIds(entry).map(submissionCountry);
    }
    case "submission_photos":
      return entry.stationId === null ? entrySubmissionIds(entry).map(submissionCountry) : [stationCountry(entry.stationId)];
    case "locations":
      return idsAt(entry.snapshots, "region_id").map(regionCountry);
    case "operators":
    case "regions":
    case "structure_owners":
    case "country_bands":
    case "role_grants":
      return ownCountryCodes(entry);
    default:
      return [null];
  }
}

function locationRegionIds(entries: readonly SnapshotEntry[]): Map<number, number[]> {
  const regionIdsByLocation = new Map<number, number[]>();
  for (const entry of entries) {
    if (entry.entity !== "locations" || entry.recordId === null) continue;
    const locationId = Number(entry.recordId);
    if (Number.isInteger(locationId)) regionIdsByLocation.set(locationId, idsAt(entry.snapshots, "region_id"));
  }
  return regionIdsByLocation;
}

function agreedCountry(entries: readonly SnapshotEntry[], lookups: CountryLookups): string | null {
  const regionIdsByLocation = locationRegionIds(entries);
  const countries = entries.flatMap((entry) => {
    const found = entryCountries(entry, lookups, regionIdsByLocation);
    return found.length === 0 ? [null] : found;
  });
  const first = countries[0] ?? null;
  return first !== null && countries.every((country) => country === first) ? first : null;
}

async function countriesById<Id>(
  ids: Id[],
  load: (ids: Id[]) => PromiseLike<{ id: Id; countryCode: string | null }[]>,
): Promise<Map<Id, string | null>> {
  const batches = await Promise.all(chunks(ids, LOOKUP_BATCH_SIZE).map((batch) => load(batch)));
  return new Map(batches.flat().map((row) => [row.id, row.countryCode]));
}

async function loadCountryLookups(handle: Reader, entries: readonly SnapshotEntry[]): Promise<CountryLookups> {
  const snapshots = entries.flatMap((entry) => entry.snapshots);
  const submissionIds = unique(entries.flatMap(entrySubmissionIds));
  const submissionBatches = await Promise.all(
    chunks(submissionIds, LOOKUP_BATCH_SIZE).map((ids) =>
      handle
        .select({ id: submissions.id, stationId: submissions.station_id, proposedCountryCode: stationCountryCode })
        .from(submissions)
        .leftJoin(proposedLocations, eq(proposedLocations.submission_id, submissions.id))
        .leftJoin(regions, eq(regions.id, proposedLocations.region_id))
        .leftJoin(proposedStations, eq(proposedStations.submission_id, submissions.id))
        .leftJoin(operators, eq(operators.id, proposedStations.operator_id))
        .where(inArray(submissions.id, ids)),
    ),
  );
  const submissionRows: ({ id: string } & SubmissionPlace)[] = submissionBatches.flat();
  const stationIds = unique([...entries.flatMap(entryStationIds), ...submissionRows.map((row) => row.stationId)]);
  const locationIds = idsAt(snapshots, "location_id");
  const regionIds = unique([...idsAt(snapshots, "region_id"), ...idsAt(snapshots, "proposedLocation", "region_id")]);
  const operatorIds = unique([...idsAt(snapshots, "operator_id"), ...idsAt(snapshots, "proposedStation", "operator_id")]);

  const [stationCountryById, locationCountryById, regionCountryById, operatorCountryById] = await Promise.all([
    countriesById(stationIds, (ids) =>
      handle
        .select({ id: stationCountries.stationId, countryCode: stationCountries.countryCode })
        .from(stationCountries.table)
        .where(inArray(stationCountries.stationId, ids)),
    ),
    countriesById(locationIds, (ids) =>
      handle
        .select({ id: locations.id, countryCode: regions.countryCode })
        .from(locations)
        .innerJoin(regions, eq(regions.id, locations.region_id))
        .where(inArray(locations.id, ids)),
    ),
    countriesById(regionIds, (ids) =>
      handle.select({ id: regions.id, countryCode: regions.countryCode }).from(regions).where(inArray(regions.id, ids)),
    ),
    countriesById(operatorIds, (ids) =>
      handle.select({ id: operators.id, countryCode: operators.countryCode }).from(operators).where(inArray(operators.id, ids)),
    ),
  ]);

  return {
    stations: stationCountryById,
    locations: locationCountryById,
    regions: regionCountryById,
    operators: operatorCountryById,
    submissions: new Map(submissionRows.map((row) => [row.id, row])),
  };
}

function countrySnapshot(snapshot: SQLWrapper): SQL {
  return sql`CASE WHEN ${snapshot} IS NULL OR ${snapshot} = 'null'::jsonb THEN NULL
    ELSE jsonb_build_object(
      'station_id', ${snapshot}->'station_id',
      'location_id', ${snapshot}->'location_id',
      'region_id', ${snapshot}->'region_id',
      'operator_id', ${snapshot}->'operator_id',
      'countryCode', ${snapshot}->'countryCode',
      'submission_id', ${snapshot}->'submission_id',
      'proposedLocation', jsonb_build_object('region_id', ${snapshot}->'proposedLocation'->'region_id'),
      'proposedStation', jsonb_build_object('operator_id', ${snapshot}->'proposedStation'->'operator_id')
    ) END`;
}

export async function loadOperationCountries(handle: Reader, operationIds: readonly number[]): Promise<Map<number, string | null>> {
  const countries = new Map<number, string | null>(operationIds.map((id) => [id, null]));
  if (operationIds.length === 0) return countries;

  const fields = {
    operationId: auditLogs.operation_id,
    entity: auditLogs.entity,
    stationId: auditLogs.station_id,
    recordId: sql<string | null>`CASE WHEN ${auditLogs.entity} IN ('locations', 'submissions') THEN ${auditLogs.record_id} ELSE NULL END`,
    oldValues: countrySnapshot(auditLogs.old_values),
    newValues: countrySnapshot(auditLogs.new_values),
  };
  const rows = await handle
    .select(fields)
    .from(auditLogs)
    .where(inArray(auditLogs.operation_id, [...operationIds]))
    .groupBy(fields.operationId, fields.entity, fields.stationId, fields.recordId, fields.oldValues, fields.newValues)
    .orderBy(asc(sql`max(${auditLogs.id})`));
  const entries = rows.map(({ oldValues, newValues, ...entry }) => ({
    ...entry,
    snapshots: [oldValues, newValues].filter((snapshot) => snapshot !== null && snapshot !== undefined),
  }));
  const lookups = await loadCountryLookups(handle, entries);

  const entriesByOperation = Map.groupBy(entries, (entry) => entry.operationId);
  for (const [operationId, operationEntries] of entriesByOperation) countries.set(operationId, agreedCountry(operationEntries, lookups));
  return countries;
}

export async function stampOperationCountry(tx: DbTx, operationId: number): Promise<void> {
  try {
    await tx.transaction(async (nested) => {
      const countryCode = (await loadOperationCountries(nested, [operationId])).get(operationId) ?? null;
      await nested.update(auditOperations).set({ country_code: countryCode }).where(eq(auditOperations.id, operationId));
    });
  } catch (error) {
    logger.error("audit.country", { operationId, error });
  }
}
