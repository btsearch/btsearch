import { locations, operators, regions, stations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import { stationCountryCode } from "../../../stations/country.js";
import type { Point } from "../../tiles/squares.js";

export type StationPlace = { point: Point | null; operatorId: number | null; siteId: string; countryCode: string | null };

export async function loadStationPlaces(tx: DbTx, stationIds: readonly number[]): Promise<Map<number, StationPlace>> {
  if (stationIds.length === 0) return new Map();

  const rows = await tx
    .select({
      id: stations.id,
      operatorId: stations.operator_id,
      siteId: stations.station_id,
      latitude: locations.latitude,
      longitude: locations.longitude,
      countryCode: stationCountryCode,
    })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .where(inArray(stations.id, [...stationIds]));
  return new Map(
    rows.map(({ id, latitude, longitude, ...place }): [number, StationPlace] => [
      id,
      { ...place, point: latitude === null || longitude === null ? null : { latitude, longitude } },
    ]),
  );
}
