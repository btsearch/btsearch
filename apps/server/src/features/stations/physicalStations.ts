import { operatorLinks, operators, stations, stationsPermits } from "@openbts/drizzle";
import { NETWORKS_PARTNER_MNCS, getNetworksSiblingMnc, isNetworksPartnerMnc } from "@openbts/shared/operatorUtils";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";

export const physicalStationSchema = createSelectSchema(stations)
  .pick({ id: true, station_id: true, status: true })
  .extend({ operator: createSelectSchema(operators) });

export type PhysicalStation = z.infer<typeof physicalStationSchema>;

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
    .where(and(eq(stations.location_id, locationId), inArray(operators.mnc, NETWORKS_PARTNER_MNCS)))
    .orderBy(sql`${stations.status} = 'inactive'`, asc(stations.id));

  const physicalStations = new Map<number, PhysicalStation>();
  for (const station of rows) {
    if (station.hasPermits || station.operator.mnc === null) continue;
    const siblingMnc = getNetworksSiblingMnc(station.operator.mnc);
    const physical = rows.find((candidate) => candidate.hasPermits && candidate.operator.mnc === siblingMnc);
    if (!physical) continue;
    const { id, station_id, status, operator } = physical;
    physicalStations.set(station.id, { id, station_id, status, operator });
  }
  return physicalStations;
}

export async function findHostStationIds(locationIds: readonly number[]): Promise<Map<number, number>> {
  const hostStationIds = new Map<number, number>();
  if (locationIds.length === 0) return hostStationIds;

  const rows = await db
    .select({
      id: stations.id,
      locationId: stations.location_id,
      operatorId: operatorLinks.operatorId,
      sharedNetworkId: operatorLinks.relatedOperatorId,
      hasPermits: sql<boolean>`EXISTS (SELECT 1 FROM ${stationsPermits} WHERE ${stationsPermits.station_id} = ${stations.id})`,
    })
    .from(stations)
    .innerJoin(operatorLinks, and(eq(operatorLinks.operatorId, stations.operator_id), eq(operatorLinks.kind, "jv_member")))
    .where(inArray(stations.location_id, [...locationIds]))
    .orderBy(sql`${stations.status} = 'inactive'`, asc(stations.id));

  type HostCandidate = Pick<(typeof rows)[number], "id" | "operatorId">;
  type HostCandidates = { first: HostCandidate; firstDifferentOperator?: HostCandidate };
  const candidatesByLocation = new Map<number | null, Map<number, HostCandidates>>();
  for (const station of rows) {
    if (!station.hasPermits) continue;

    let candidatesByNetwork = candidatesByLocation.get(station.locationId);
    if (candidatesByNetwork === undefined) {
      candidatesByNetwork = new Map();
      candidatesByLocation.set(station.locationId, candidatesByNetwork);
    }
    const candidates = candidatesByNetwork.get(station.sharedNetworkId);
    if (candidates === undefined) candidatesByNetwork.set(station.sharedNetworkId, { first: station });
    else if (candidates.firstDifferentOperator === undefined && candidates.first.operatorId !== station.operatorId)
      candidates.firstDifferentOperator = station;
  }

  for (const station of rows) {
    if (station.hasPermits || hostStationIds.has(station.id)) continue;

    const candidates = candidatesByLocation.get(station.locationId)?.get(station.sharedNetworkId);
    if (candidates === undefined) continue;
    const host = candidates.first.operatorId === station.operatorId ? candidates.firstDifferentOperator : candidates.first;
    if (host !== undefined) hostStationIds.set(station.id, host.id);
  }
  return hostStationIds;
}

export async function findPermitHolderStation(permitIds: number[]): Promise<PhysicalStation | null> {
  if (permitIds.length === 0) return null;

  const [station] = await db
    .select({ id: stations.id, station_id: stations.station_id, status: stations.status, operator: operators })
    .from(stationsPermits)
    .innerJoin(stations, eq(stations.id, stationsPermits.station_id))
    .innerJoin(operators, eq(operators.id, stations.operator_id))
    .where(inArray(stationsPermits.permit_id, permitIds))
    .orderBy(sql`${stations.status} = 'inactive'`, asc(stations.id))
    .limit(1);
  return station ?? null;
}

export async function findPhysicalStation(
  stationId: number,
  locationId: number | undefined,
  mnc: number | null | undefined,
): Promise<PhysicalStation | undefined> {
  if (locationId === undefined || !isNetworksPartnerMnc(mnc)) return undefined;
  return (await findPhysicalStations(locationId)).get(stationId);
}
