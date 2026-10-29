import { hasOfficialSites } from "@openbts/country-packs/sources";
import { locations, operatorLinks, operators, regions, stations, stationsOfficialSites } from "@openbts/drizzle";
import { NETWORKS_PARTNER_MNCS, getNetworksSiblingMnc, isNetworksPartnerMnc } from "@openbts/shared/operatorUtils";
import { and, asc, eq, exists, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { StationRow } from "./serialize.js";

export const physicalStationSchema = createSelectSchema(stations)
  .pick({ id: true, station_id: true, status: true })
  .extend({ operator: createSelectSchema(operators) });

export type PhysicalStation = z.infer<typeof physicalStationSchema>;

function hasOfficialSite() {
  return exists(
    db.select({ stationId: stationsOfficialSites.station_id }).from(stationsOfficialSites).where(eq(stationsOfficialSites.station_id, stations.id)),
  ).mapWith(Boolean);
}

export async function findPhysicalStations(locationId: number): Promise<Map<number, PhysicalStation>> {
  const rows = await db
    .select({
      id: stations.id,
      station_id: stations.station_id,
      status: stations.status,
      operator: operators,
      hasOfficialSite: hasOfficialSite(),
    })
    .from(stations)
    .innerJoin(operators, eq(operators.id, stations.operator_id))
    .where(and(eq(stations.location_id, locationId), inArray(operators.mnc, NETWORKS_PARTNER_MNCS)))
    .orderBy(sql`${stations.status} = 'inactive'`, asc(stations.id));

  const physicalStations = new Map<number, PhysicalStation>();
  for (const station of rows) {
    if (station.hasOfficialSite || station.operator.mnc === null) continue;
    const siblingMnc = getNetworksSiblingMnc(station.operator.mnc);
    const physical = rows.find((candidate) => candidate.hasOfficialSite && candidate.operator.mnc === siblingMnc);
    if (!physical) continue;
    const { id, station_id, status, operator } = physical;
    physicalStations.set(station.id, { id, station_id, status, operator });
  }
  return physicalStations;
}

export async function findHostStationIds(
  stationRows: readonly Pick<StationRow, "id" | "location_id" | "ran_host_station_id">[],
): Promise<Map<number, number>> {
  const hostStationIds = new Map<number, number>();
  const locationIds = unique(stationRows.map((station) => station.location_id));
  if (locationIds.length === 0) return hostStationIds;

  const residents = await db
    .select({
      id: stations.id,
      locationId: stations.location_id,
      countryCode: regions.countryCode,
      operatorId: operatorLinks.operatorId,
      sharedNetworkId: operatorLinks.relatedOperatorId,
      hasOfficialSite: hasOfficialSite(),
    })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operatorLinks, and(eq(operatorLinks.operatorId, stations.operator_id), eq(operatorLinks.kind, "jv_member")))
    .where(inArray(stations.location_id, locationIds))
    .orderBy(sql`${stations.status} = 'inactive'`, asc(stations.id));

  type NetworkMember = (typeof residents)[number] & { operatorId: number; sharedNetworkId: number };
  const officialLocationIds = new Set(residents.filter((station) => hasOfficialSites(station.countryCode)).map((station) => station.locationId));
  const networkMembers = residents.filter(
    (station): station is NetworkMember =>
      station.operatorId !== null && station.sharedNetworkId !== null && officialLocationIds.has(station.locationId),
  );

  type HostCandidate = Pick<NetworkMember, "id" | "operatorId">;
  type HostCandidates = { first: HostCandidate; firstDifferentOperator?: HostCandidate };
  const candidatesByLocation = new Map<number | null, Map<number, HostCandidates>>();
  for (const station of networkMembers) {
    if (!station.hasOfficialSite) continue;

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

  for (const station of networkMembers) {
    if (station.hasOfficialSite || hostStationIds.has(station.id)) continue;

    const candidates = candidatesByLocation.get(station.locationId)?.get(station.sharedNetworkId);
    if (candidates === undefined) continue;
    const host = candidates.first.operatorId === station.operatorId ? candidates.firstDifferentOperator : candidates.first;
    if (host !== undefined) hostStationIds.set(station.id, host.id);
  }

  for (const station of stationRows) {
    if (station.location_id === null || officialLocationIds.has(station.location_id)) continue;
    if (station.ran_host_station_id !== null) hostStationIds.set(station.id, station.ran_host_station_id);
  }
  return hostStationIds;
}

export async function findPhysicalStation(
  stationId: number,
  locationId: number | undefined,
  mnc: number | null | undefined,
): Promise<PhysicalStation | undefined> {
  if (locationId === undefined || !isNetworksPartnerMnc(mnc)) return undefined;
  return (await findPhysicalStations(locationId)).get(stationId);
}
