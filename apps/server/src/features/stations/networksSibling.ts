import { cells, lteCells, stations } from "@openbts/drizzle";
import { getNetworksSiblingMnc } from "@openbts/shared/operatorUtils";
import { and, eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";

function stripFirstDigit(enbid: number): number | null {
  if (enbid <= 0) return null;
  return enbid % 10 ** Math.floor(Math.log10(enbid));
}

function candidateEnbids(stripped: number): number[] {
  const magnitude = 10 ** (Math.floor(Math.log10(stripped)) + 1);
  return Array.from({ length: 9 }, (_, i) => stripped + (i + 1) * magnitude);
}

export async function findSiblingStationIdByEnbid(
  stationId: number,
  locationId: number | null,
  mnc: number | null | undefined,
): Promise<number | null> {
  const siblingMnc = getNetworksSiblingMnc(mnc);
  if (siblingMnc === null || !locationId) return null;

  const currentLteCells = await db
    .select({ enbid: lteCells.enbid })
    .from(lteCells)
    .innerJoin(cells, eq(cells.id, lteCells.cell_id))
    .where(eq(cells.station_id, stationId));

  const stripped = [...new Set(currentLteCells.map(({ enbid }) => stripFirstDigit(enbid)).filter((value): value is number => value !== null))];
  if (stripped.length === 0) return null;

  const siblingOperator = await db.query.operators.findFirst({ where: { mnc: siblingMnc } });
  if (!siblingOperator) return null;

  const [siblingRow] = await db
    .select({ stationId: stations.id })
    .from(lteCells)
    .innerJoin(cells, eq(cells.id, lteCells.cell_id))
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .where(
      and(
        eq(stations.location_id, locationId),
        eq(stations.operator_id, siblingOperator.id),
        inArray(lteCells.enbid, stripped.flatMap(candidateEnbids)),
      ),
    )
    .limit(1);
  return siblingRow?.stationId ?? null;
}
