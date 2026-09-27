import { cells, lteCells, nrCells, type stations } from "@openbts/drizzle";
import { type SQL, inArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { type StationStatus, buildStatusCondition } from "./status.js";
import { type UplinkType, buildUplinkCondition } from "./uplink.js";

type NonIotRat = "GSM" | "UMTS" | "LTE" | "NR";

const NON_IOT_RATS: Record<string, NonIotRat> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };

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
  nonIotRats: NonIotRat[];
  iotRequested: boolean;
  since: StationSinceFilter | null;
  uplinkTypes: UplinkType[];
};

export async function resolveStationFilter(params: StationFilterParams): Promise<StationFilter | null> {
  const { operators: operatorMncs, bands: bandValues, rat: rats = [] } = params;
  const expandedOperatorMncs = operatorMncs?.includes(26034) ? [...new Set([...operatorMncs, 26002, 26003])] : operatorMncs;

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
    filter.nonIotRats.length > 0 ||
    filter.iotRequested ||
    filter.since !== null ||
    filter.uplinkTypes.length > 0
  );
}

export function buildStationFilterConditions(stationFields: typeof stations, filter: StationFilter): SQL[] {
  const { operatorIds, bandIds, nonIotRats, iotRequested, since, uplinkTypes } = filter;
  const conditions: SQL[] = [buildStatusCondition(stationFields, filter.statuses)];

  if (operatorIds.length) conditions.push(inArray(stationFields.operator_id, operatorIds));

  const cellConditions: SQL[] = [];
  if (bandIds.length || nonIotRats.length) {
    const cellMatches: SQL[] = [];
    if (bandIds.length) cellMatches.push(inArray(cells.band_id, bandIds));
    if (nonIotRats.length) cellMatches.push(inArray(cells.rat, nonIotRats));
    cellConditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      WHERE ${cells.station_id} = ${stationFields.id}
      AND ${sql.join(cellMatches, sql` AND `)}
    )`);
  }
  if (iotRequested) {
    const bandCondition = bandIds.length ? sql`AND ${inArray(cells.band_id, bandIds)}` : sql``;
    cellConditions.push(sql`EXISTS (
      SELECT 1 FROM ${cells}
      WHERE ${cells.station_id} = ${stationFields.id}
      ${bandCondition}
      AND (
        EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id} AND ${lteCells.supports_iot} = true)
        OR EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id} AND ${nrCells.supports_nr_redcap} = true)
      )
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
