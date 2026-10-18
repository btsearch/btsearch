import { cellPlmns, cells, operators, plmns, stations } from "@openbts/drizzle";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";

export type CellExtra = { cellId: number; stationId: number; code: string; operatorId: number };

export async function loadCellExtras(stationIds: readonly number[]): Promise<CellExtra[]> {
  if (stationIds.length === 0) return [];

  return db
    .select({ cellId: cellPlmns.cellId, stationId: cells.station_id, code: plmns.code, operatorId: plmns.operatorId })
    .from(cellPlmns)
    .innerJoin(cells, eq(cells.id, cellPlmns.cellId))
    .innerJoin(plmns, eq(plmns.id, cellPlmns.plmnId))
    .innerJoin(operators, eq(operators.id, plmns.operatorId))
    .where(inArray(cells.station_id, [...stationIds]))
    .orderBy(operators.countryCode, sql`${operators.sortPriority} ASC NULLS LAST`, operators.name, operators.id, asc(plmns.code));
}

export async function loadOwnerCodes(stationIds: readonly number[]): Promise<Map<number, string>> {
  if (stationIds.length === 0) return new Map();

  const rows = await db
    .select({ stationId: stations.id, ownerCode: plmns.code })
    .from(plmns)
    .innerJoin(stations, and(eq(stations.operator_id, plmns.operatorId), eq(plmns.role, "primary")))
    .where(inArray(stations.id, [...stationIds]));
  return new Map(rows.map((row) => [row.stationId, row.ownerCode]));
}

export function extraCodesByCell(extras: readonly Pick<CellExtra, "cellId" | "code">[]): Map<number, string[]> {
  const codes = new Map<number, string[]>();
  for (const extra of extras) codes.set(extra.cellId, [...(codes.get(extra.cellId) ?? []), extra.code]);
  for (const list of codes.values()) list.sort();
  return codes;
}

export function guestOperatorIdsByStation(extras: readonly CellExtra[], ownerByStation: ReadonlyMap<number, number | null>): Map<number, number[]> {
  const guests = new Map<number, number[]>();
  for (const extra of extras) {
    const listed = guests.get(extra.stationId) ?? [];
    if (extra.operatorId === ownerByStation.get(extra.stationId) || listed.includes(extra.operatorId)) continue;
    guests.set(extra.stationId, [...listed, extra.operatorId]);
  }
  return guests;
}

export function cellNetworkCodes(ownerCode: string | undefined, extraCodes: readonly string[] | undefined): string[] {
  const extras = (extraCodes ?? []).filter((code) => code !== ownerCode);
  return ownerCode === undefined ? extras : [ownerCode, ...extras];
}
