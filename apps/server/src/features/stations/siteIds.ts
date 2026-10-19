import { cells, gsmCells, lteCells, nrCells, umtsCells } from "@openbts/drizzle";
import { CID_RANGE, RESERVED_SITE_ID_PREFIX, SITE_ID_NEEDED_MESSAGE, toNodeName } from "@openbts/shared/contract";
import { type Column, type SQL, and, eq, inArray, min, ne, notLike, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../errors.js";
import type { DbTx } from "../../types/global.js";

type Reader = Pick<DbTx, "select">;

export function isPlaceholderSiteId(siteId: string): boolean {
  return siteId.startsWith(RESERVED_SITE_ID_PREFIX);
}

export function toSiteId(stationId: string | null): string | null {
  return stationId === null || isPlaceholderSiteId(stationId) ? null : stationId;
}

export function isSameSiteId(proposed: string, current: string | null): boolean {
  return proposed === current || (current !== null && isPlaceholderSiteId(proposed) && isPlaceholderSiteId(current));
}

export function placeholderSiteId(id: number): string {
  return `${RESERVED_SITE_ID_PREFIX}${id}`;
}

export function hasOperatorSiteId(column: Column): SQL {
  return notLike(column, `${RESERVED_SITE_ID_PREFIX}%`);
}

export async function takeStationId(tx: DbTx): Promise<number> {
  const [row] = await tx.execute<{ id: number }>(sql`SELECT nextval(pg_get_serial_sequence('stations', 'id'))::int AS id`);
  if (!row) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create station" });
  return row.id;
}

export async function loadNodeNames(stationIds: readonly number[], reader: Reader = db): Promise<Map<number, string>> {
  if (stationIds.length === 0) return new Map();

  const rows = await reader
    .select({
      stationId: cells.station_id,
      enbid: min(lteCells.enbid),
      gnbid: min(nrCells.gnbid),
      longCid: min(umtsCells.cid_long),
      gsmCellKey: sql<number | null>`min(${gsmCells.lac}::bigint * ${CID_RANGE} + ${gsmCells.cid})`.mapWith(Number),
    })
    .from(cells)
    .leftJoin(lteCells, and(eq(lteCells.cell_id, cells.id), eq(cells.rat, "LTE"), ne(lteCells.enbid, 0)))
    .leftJoin(nrCells, and(eq(nrCells.cell_id, cells.id), eq(cells.rat, "NR"), ne(nrCells.gnbid, 0)))
    .leftJoin(umtsCells, and(eq(umtsCells.cell_id, cells.id), eq(cells.rat, "UMTS"), ne(umtsCells.rnc, 0)))
    .leftJoin(gsmCells, and(eq(gsmCells.cell_id, cells.id), eq(cells.rat, "GSM"), ne(gsmCells.lac, 0)))
    .where(inArray(cells.station_id, [...stationIds]))
    .groupBy(cells.station_id);
  return new Map(
    rows.flatMap((row) => {
      const name = toNodeName(row);
      return name === null ? [] : [[row.stationId, name] as const];
    }),
  );
}

export async function assertMayLackSiteId(tx: DbTx, stationId: number): Promise<void> {
  const nodeNames = await loadNodeNames([stationId], tx);
  if (!nodeNames.has(stationId)) throw new ValidationError([{ field: "station/siteId", validationMessage: SITE_ID_NEEDED_MESSAGE }]);
}
