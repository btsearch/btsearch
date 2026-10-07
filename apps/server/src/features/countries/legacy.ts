import { cells, locations, operators, proposedLocations, proposedStations, regions, stations } from "@openbts/drizzle";
import { MAX_ID } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, eq, inArray, not, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import { LEGACY_COUNTRY_CODE } from "../../constants.js";
import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { stationCountryCode, stationPlacementJoins } from "../stations/country.js";

type SubmissionKeys = { id: SQLWrapper; stationId: SQLWrapper };
type PinnedRecord = { resource: "stations" | "locations" | "cells"; id: number };

const LEGACY_API_PREFIX = "/api/v1/";
const PIN_STATION = sql`${stations} AS pin_station`;
const PIN_CELL_STATION = sql`${cells} AS pin_cell INNER JOIN ${stations} AS pin_station ON pin_station.id = pin_cell.station_id`;

export function isLegacyRequest(req: FastifyRequest): boolean {
  return req.routeOptions.url?.startsWith(LEGACY_API_PREFIX) === true;
}

export function isOutsideLegacyCountry(countryCode: string | null | undefined): boolean {
  return typeof countryCode === "string" && countryCode !== LEGACY_COUNTRY_CODE;
}

function hasNoForeignStation(source: SQL, match: SQL): SQL<boolean> {
  return sql<boolean>`(NOT EXISTS (
      SELECT 1 FROM ${source}
      INNER JOIN ${locations} AS pin_location ON pin_location.id = pin_station.location_id
      INNER JOIN ${regions} AS pin_region ON pin_region.id = pin_location.region_id
      WHERE ${match} AND pin_region.country_code <> ${LEGACY_COUNTRY_CODE}
    ) AND NOT EXISTS (
      SELECT 1 FROM ${source}
      INNER JOIN ${operators} AS pin_operator ON pin_operator.id = pin_station.operator_id
      WHERE ${match} AND pin_station.location_id IS NULL AND pin_operator.country_code <> ${LEGACY_COUNTRY_CODE}
    ))`;
}

export function stationIdInLegacyCountry(stationId: SQLWrapper): SQL<boolean> {
  return hasNoForeignStation(PIN_STATION, sql`pin_station.id = ${stationId}`);
}

export function cellIdInLegacyCountry(cellId: SQLWrapper): SQL<boolean> {
  return hasNoForeignStation(PIN_CELL_STATION, sql`pin_cell.id = ${cellId}`);
}

export function regionInLegacyCountry(regionId: SQLWrapper): SQL<boolean> {
  return sql<boolean>`(${regionId} IN (
    SELECT pin_home_region.id FROM ${regions} AS pin_home_region WHERE pin_home_region.country_code = ${LEGACY_COUNTRY_CODE}
  ))`;
}

export function submissionInLegacyCountry({ id, stationId }: SubmissionKeys): SQL<boolean> {
  return sql<boolean>`(COALESCE(
    (SELECT ${stationCountryCode} FROM ${stations} ${stationPlacementJoins} WHERE ${stations.id} = ${stationId}),
    (SELECT pin_proposed_region.country_code FROM ${proposedLocations} AS pin_proposed_location
      INNER JOIN ${regions} AS pin_proposed_region ON pin_proposed_region.id = pin_proposed_location.region_id
      WHERE pin_proposed_location.submission_id = ${id} LIMIT 1),
    (SELECT pin_proposed_operator.country_code FROM ${proposedStations} AS pin_proposed_station
      INNER JOIN ${operators} AS pin_proposed_operator ON pin_proposed_operator.id = pin_proposed_station.operator_id
      WHERE pin_proposed_station.submission_id = ${id} LIMIT 1),
    ${LEGACY_COUNTRY_CODE}
  ) = ${LEGACY_COUNTRY_CODE})`;
}

export async function findForeignStationIds(stationIds: readonly number[]): Promise<Set<number>> {
  const ids = [...new Set(stationIds)];
  if (ids.length === 0) return new Set();

  const rows = await db
    .select({ id: stations.id })
    .from(stations)
    .where(and(inArray(stations.id, ids), not(stationIdInLegacyCountry(stations.id))));
  return new Set(rows.map((row) => row.id));
}

function pinnedRecord(req: FastifyRequest): PinnedRecord | null {
  const [resource, parameter] = (req.routeOptions.url ?? "").slice(LEGACY_API_PREFIX.length).split("/");
  if (!parameter?.startsWith(":")) return null;

  const id = (req.params as Record<string, unknown>)[parameter.slice(1)];
  if (resource !== "stations" && resource !== "locations" && resource !== "cells") return null;
  return typeof id === "number" && Number.isInteger(id) && id > 0 && id <= MAX_ID ? { resource, id } : null;
}

function findForeignRecord(record: PinnedRecord): Promise<unknown[]> {
  if (record.resource === "stations") {
    return db
      .select({ id: stations.id })
      .from(stations)
      .where(and(eq(stations.id, record.id), not(stationIdInLegacyCountry(stations.id))))
      .limit(1);
  }
  if (record.resource === "cells") {
    return db
      .select({ id: cells.id })
      .from(cells)
      .where(and(eq(cells.id, record.id), not(stationIdInLegacyCountry(cells.station_id))))
      .limit(1);
  }
  return db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, record.id), not(regionInLegacyCountry(locations.region_id))))
    .limit(1);
}

export async function assertLegacyRecord(req: FastifyRequest): Promise<void> {
  if (!isLegacyRequest(req)) return;

  const record = pinnedRecord(req);
  if (record === null) return;

  const foreign = await findForeignRecord(record);
  if (foreign.length > 0) throw new ErrorResponse("NOT_FOUND");
}
