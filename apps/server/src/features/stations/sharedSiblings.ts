import { conventionsFor } from "@openbts/country-packs";
import { cells, lteCells, operatorLinks, stations } from "@openbts/drizzle";
import { type AnyColumn, type SQL, and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { loadOperatorRefs } from "../operators/ref.js";
import { findPlacementCountryCode } from "./country.js";

type Reader = Pick<DbTx, "select">;
type SiteStation = { id: number; locationId: number | null; operatorId: number | null };

export function sharesNetworkWith(operatorId: AnyColumn, memberOperatorId: number): SQL {
  const sharedNetworks = db
    .select({ id: operatorLinks.relatedOperatorId })
    .from(operatorLinks)
    .where(and(eq(operatorLinks.operatorId, memberOperatorId), eq(operatorLinks.kind, "jv_member")));
  const members = db
    .select({ id: operatorLinks.operatorId })
    .from(operatorLinks)
    .where(and(inArray(operatorLinks.relatedOperatorId, sharedNetworks), eq(operatorLinks.kind, "jv_member")));

  return sql`(${ne(operatorId, memberOperatorId)} AND ${inArray(operatorId, members)})`;
}

export async function keepSameEnbSiblingIds(station: SiteStation, siblingIds: readonly number[], reader: Reader = db): Promise<number[]> {
  const { operatorId } = station;
  if (operatorId === null || siblingIds.length === 0) return [];

  const [ownCells, countryCode, operatorRefs] = await Promise.all([
    reader
      .select({ enbid: lteCells.enbid })
      .from(lteCells)
      .innerJoin(cells, eq(cells.id, lteCells.cell_id))
      .where(and(eq(cells.station_id, station.id), gt(lteCells.enbid, 0))),
    findPlacementCountryCode({ stationId: station.id }, reader),
    loadOperatorRefs([operatorId], reader),
  ]);
  const operatorRef = operatorRefs.get(operatorId);
  if (operatorRef === undefined) return [];

  const { equivalentEnbids } = conventionsFor(countryCode);
  const enbids = unique(ownCells.flatMap(({ enbid }) => equivalentEnbids(operatorRef, enbid)));
  if (enbids.length === 0) return [];

  const sameEnbRows = await reader
    .select({ stationId: cells.station_id })
    .from(lteCells)
    .innerJoin(cells, eq(cells.id, lteCells.cell_id))
    .where(and(inArray(cells.station_id, [...siblingIds]), inArray(lteCells.enbid, enbids)))
    .groupBy(cells.station_id);
  const sameEnbIds = new Set(sameEnbRows.map(({ stationId }) => stationId));
  return siblingIds.filter((id) => sameEnbIds.has(id));
}

export async function findSharedSiblingIds(
  station: SiteStation,
  { sameEnb = false }: { sameEnb?: boolean } = {},
  reader: Reader = db,
): Promise<number[]> {
  const { locationId, operatorId } = station;
  if (locationId === null || operatorId === null) return [];

  const siblings = await reader
    .select({ id: stations.id })
    .from(stations)
    .where(and(eq(stations.location_id, locationId), sharesNetworkWith(stations.operator_id, operatorId)))
    .orderBy(desc(sql`${stations.status} = 'published'`), asc(stations.id));
  const siblingIds = siblings.map(({ id }) => id);
  return sameEnb ? keepSameEnbSiblingIds(station, siblingIds, reader) : siblingIds;
}
