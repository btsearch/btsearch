import { cells, lteCells, nrCells, stationPhotoSelections, type stationSectors, type stations } from "@openbts/drizzle";
import { expandNetworksMncs } from "@openbts/shared/operatorUtils";
import { type SQL, and, inArray, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { bandCondition } from "../bands/unknown.js";
import { type StationStatus, buildStatusCondition } from "./status.js";
import { type UplinkType, buildUplinkCondition } from "./uplink.js";

type NonIotRat = "GSM" | "UMTS" | "LTE" | "NR";

const NON_IOT_RATS: Record<string, NonIotRat> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };
export const IOT_CAPABLE_CELL = sql`(
  EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id} AND ${lteCells.supports_iot} = true)
  OR EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id} AND ${nrCells.supports_nr_redcap} = true)
)`;
const SECTOR_WITHOUT_CELLS_IS_KEPT = sql`true`;

export type StationSinceFilter = { fields: ("createdAt" | "updatedAt")[]; cutoff: Date };

export type StationFilterParams = {
  status: StationStatus[];
  operators?: number[];
  bands?: number[];
  rat?: string[];
  since: StationSinceFilter | null;
  uplink?: UplinkType[];
};

export type StationFilter = {
  statuses: StationStatus[];
  operatorIds: number[];
  bandIds: number[];
  includesUnknownBand: boolean;
  nonIotRats: NonIotRat[];
  iotRequested: boolean;
  since: StationSinceFilter | null;
  uplinkTypes: UplinkType[];
};

export type SectorFilter = Pick<StationFilter, "bandIds" | "includesUnknownBand" | "nonIotRats" | "iotRequested">;

export async function resolveStationFilter(params: StationFilterParams): Promise<StationFilter | null> {
  const { operators: operatorMncs, bands: bandValues, rat: rats = [] } = params;
  const expandedOperatorMncs = expandNetworksMncs(operatorMncs);

  const [bandRows, operatorRows] = await Promise.all([
    bandValues?.length ? db.query.bands.findMany({ columns: { id: true }, where: { value: { in: bandValues } } }) : [],
    expandedOperatorMncs?.length ? db.query.operators.findMany({ columns: { id: true }, where: { mnc: { in: expandedOperatorMncs } } }) : [],
  ]);

  if (bandValues?.length && !bandRows.length) return null;
  if (operatorMncs?.length && !operatorRows.length) return null;

  return {
    statuses: params.status,
    operatorIds: operatorRows.map((row) => row.id),
    bandIds: bandRows.map((row) => row.id),
    includesUnknownBand: false,
    nonIotRats: rats.map((rat) => NON_IOT_RATS[rat]).filter((rat): rat is NonIotRat => rat !== undefined),
    iotRequested: rats.includes("iot"),
    since: params.since,
    uplinkTypes: params.uplink ?? [],
  };
}

export function hasStationFilterCriteria(filter: StationFilter): boolean {
  return (
    filter.operatorIds.length > 0 ||
    filter.bandIds.length > 0 ||
    filter.includesUnknownBand ||
    filter.nonIotRats.length > 0 ||
    filter.iotRequested ||
    filter.since !== null ||
    filter.uplinkTypes.length > 0
  );
}

export function buildStationFilterConditions(stationFields: typeof stations, filter: StationFilter): SQL[] {
  const { operatorIds, nonIotRats, iotRequested, since, uplinkTypes } = filter;
  const conditions: SQL[] = [buildStatusCondition(stationFields, filter.statuses)];

  if (operatorIds.length) conditions.push(inArray(stationFields.operator_id, operatorIds));

  const bandMatch = bandCondition(cells.band_id, filter);
  const bandAloneIsNamed = bandMatch !== undefined && nonIotRats.length === 0 && !iotRequested;
  const cellConditions: SQL[] = [];
  if (nonIotRats.length || bandAloneIsNamed) {
    const cellMatches: SQL[] = [];
    if (bandMatch) cellMatches.push(bandMatch);
    if (nonIotRats.length) cellMatches.push(inArray(cells.rat, nonIotRats));
    cellConditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${sql.join(cellMatches, sql` AND `)}
    )`);
  }
  if (iotRequested) {
    const andBandMatch = bandMatch ? sql`AND ${bandMatch}` : sql``;
    cellConditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      WHERE ${cells.station_id} = ${stationFields.id}
      ${andBandMatch}
      AND ${IOT_CAPABLE_CELL}
    )`);
  }
  if (cellConditions.length) conditions.push(sql`(${sql.join(cellConditions, sql` OR `)})`);

  if (since) {
    const sinceConditions = since.fields.map((field) => sql`${stationFields[field]} >= ${since.cutoff.toISOString()}`);
    conditions.push(sql`(${sql.join(sinceConditions, sql` OR `)})`);
  }

  if (uplinkTypes.length) conditions.push(buildUplinkCondition(stationFields.id, uplinkTypes));

  return conditions;
}

export function buildHasPhotosCondition(stationId: typeof stations.id, hasPhotos: boolean): SQL {
  const shownPhoto = sql`(SELECT 1 FROM ${stationPhotoSelections} WHERE ${stationPhotoSelections.station_id} = ${stationId})`;
  return hasPhotos ? sql`EXISTS ${shownPhoto}` : sql`NOT EXISTS ${shownPhoto}`;
}

export function buildHasSectorsCondition(sectorFields: typeof stationSectors, stationId: typeof stations.id, hasSectors: boolean): SQL {
  const sector = sql`(SELECT 1 FROM ${sectorFields} WHERE ${sectorFields.station_id} = ${stationId})`;
  return hasSectors ? sql`EXISTS ${sector}` : sql`NOT EXISTS ${sector}`;
}

export function buildSectorFilterCondition(
  sectorFields: typeof stationSectors,
  filter: SectorFilter,
  otherCellMatches: (SQL | undefined)[],
): SQL | undefined {
  const { nonIotRats, iotRequested } = filter;
  const bandMatch = bandCondition(cells.band_id, filter);
  const technologyMatch = or(nonIotRats.length ? inArray(cells.rat, nonIotRats) : undefined, iotRequested ? IOT_CAPABLE_CELL : undefined);
  const requestedCell = or(and(bandMatch, technologyMatch), ...otherCellMatches);
  if (!requestedCell) return undefined;

  const anyAttachedCellIsRequested = sql`(
    SELECT bool_or(${requestedCell}) FROM ${cells}
    WHERE ${cells.station_id} = ${sectorFields.station_id} AND ${cells.sector_id} = ${sectorFields.id}
  )`;
  return sql`coalesce(${anyAttachedCellIsRequested}, ${SECTOR_WITHOUT_CELLS_IS_KEPT})`;
}
