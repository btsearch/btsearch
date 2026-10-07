import { bands, cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { CELL_RATS, DEFAULT_STATION_STATUSES } from "@openbts/shared/contract";
import type { CellInclude, CellListQuery, ListedCell } from "@openbts/shared/contract";
import { type SQL, eq, gte, inArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { bandCondition, splitBandFilter } from "../bands/unknown.js";
import { operatedBy } from "../operators/sharing.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../stations/countryFeatures.js";
import { serializeStations, stationAreaConditions } from "../stations/read.js";
import { type CellRows, DATABASE_RATS, DATABASE_STATUSES, type StationRow, toCell } from "../stations/serialize.js";

export type ListedCellRows = CellRows & { station: StationRow };

export const listedCellColumns = { cell: cells, gsm: gsmCells, umts: umtsCells, lte: lteCells, nr: nrCells, station: stations };

function hasRadioRow(): SQL {
  return sql`CASE ${cells.rat}
    WHEN 'GSM' THEN EXISTS (SELECT 1 FROM ${gsmCells} WHERE ${gsmCells.cell_id} = ${cells.id})
    WHEN 'UMTS' THEN EXISTS (SELECT 1 FROM ${umtsCells} WHERE ${umtsCells.cell_id} = ${cells.id})
    WHEN 'LTE' THEN EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id})
    WHEN 'NR' THEN EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id})
    ELSE false
  END`;
}

export function cellFilterConditions(query: CellListQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const statuses = (query.statuses ?? DEFAULT_STATION_STATUSES).map((status) => DATABASE_STATUSES[status]);
  const rats = (query.rats ?? CELL_RATS).map((rat) => DATABASE_RATS[rat]);
  const conditions: SQL[] = [
    inArray(stations.status, statuses),
    inArray(cells.rat, rats),
    hasRadioRow(),
    ...stationAreaConditions(query, hiddenCountryCodes),
  ];
  const bandMatch = bandCondition(cells.band_id, splitBandFilter(query.bandIds));

  if (query.stationIds) conditions.push(inArray(cells.station_id, query.stationIds));
  if (query.operatorIds) conditions.push(operatedBy(stations.operator_id, query.operatorIds));
  if (bandMatch) conditions.push(bandMatch);
  if (query.createdAfter) conditions.push(gte(cells.createdAt, new Date(query.createdAfter)));
  if (query.updatedAfter) conditions.push(gte(cells.updatedAt, new Date(query.updatedAfter)));
  return conditions;
}

export async function findListedCells(cellIds: readonly number[]): Promise<ListedCellRows[]> {
  if (cellIds.length === 0) return [];

  const rows = await db
    .select(listedCellColumns)
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .leftJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
    .leftJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
    .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
    .where(inArray(cells.id, [...cellIds]));
  const rowsById = new Map(rows.map((row) => [row.cell.id, row]));
  return cellIds.flatMap((cellId) => rowsById.get(cellId) ?? []);
}

export async function findListedCell(cellId: number): Promise<ListedCellRows> {
  const [row] = await findListedCells([cellId]);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function serializeCells(rows: readonly ListedCellRows[], include: readonly CellInclude[] = []): Promise<ListedCell[]> {
  if (rows.length === 0) return [];

  const stationRows = include.includes("station") ? [...new Map(rows.map((row) => [row.station.id, row.station])).values()] : [];
  const [bandRows, listedStations, featuresByStation] = await Promise.all([
    db.select().from(bands),
    serializeStations(stationRows),
    getStationCountryFeatures(rows.map((row) => row.cell.station_id)),
  ]);
  const bandsById = new Map(bandRows.map((row) => [row.id, row]));
  const stationsById = new Map(listedStations.map((station) => [station.id, station]));

  return rows.flatMap((row) => {
    const cell = toCell(
      row,
      bandsById.get(row.cell.band_id),
      include.includes("band"),
      featuresByStation.get(row.cell.station_id) ?? disabledCountryFeatures,
    );
    if (cell === null) return [];

    const station = stationsById.get(row.cell.station_id);
    return [station ? { ...cell, station } : cell];
  });
}

export async function serializeCell(row: ListedCellRows, include?: readonly CellInclude[]): Promise<ListedCell> {
  const [cell] = await serializeCells([row], include);
  if (!cell) throw new ErrorResponse("NOT_FOUND");
  return cell;
}
