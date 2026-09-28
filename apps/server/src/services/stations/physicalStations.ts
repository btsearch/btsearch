import { operators, stations, stationsPermits } from "@openbts/drizzle";
import { NETWORKS_SIBLING_MNC } from "@openbts/shared/operatorUtils";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";

export const physicalStationSchema = createSelectSchema(stations)
  .pick({ id: true, station_id: true, status: true })
  .extend({ operator: createSelectSchema(operators) });

export type PhysicalStation = z.infer<typeof physicalStationSchema>;

const NETWORKS_MNCS = Object.keys(NETWORKS_SIBLING_MNC).map(Number);

export async function findPhysicalStations(locationId: number): Promise<Map<number, PhysicalStation>> {
  const rows = await db
    .select({
      id: stations.id,
      station_id: stations.station_id,
      status: stations.status,
      operator: operators,
      hasPermits: sql<boolean>`EXISTS (SELECT 1 FROM ${stationsPermits} WHERE ${stationsPermits.station_id} = ${stations.id})`,
    })
    .from(stations)
    .innerJoin(operators, eq(operators.id, stations.operator_id))
    .where(and(eq(stations.location_id, locationId), inArray(operators.mnc, NETWORKS_MNCS)))
    .orderBy(sql`${stations.status} = 'inactive'`, asc(stations.id));

  const physicalStations = new Map<number, PhysicalStation>();
  for (const station of rows) {
    if (station.hasPermits || station.operator.mnc === null) continue;
    const siblingMnc = NETWORKS_SIBLING_MNC[station.operator.mnc];
    const physical = rows.find((candidate) => candidate.hasPermits && candidate.operator.mnc === siblingMnc);
    if (!physical) continue;
    const { id, station_id, status, operator } = physical;
    physicalStations.set(station.id, { id, station_id, status, operator });
  }
  return physicalStations;
}

export async function findPhysicalStation(
  stationId: number,
  locationId: number | undefined,
  mnc: number | null | undefined,
): Promise<PhysicalStation | undefined> {
  if (locationId === undefined || !mnc || NETWORKS_SIBLING_MNC[mnc] === undefined) return undefined;
  return (await findPhysicalStations(locationId)).get(stationId);
}
