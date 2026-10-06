import type { MatchedStation } from "./correlation";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { type MapPoint, type MapPointStation, createMapPointStation } from "@/features/map/data/mapPoints";
import { sortLocationStations } from "@/features/station-details/station/utils/stations";

function toMatchedPointStation(match: MatchedStation, lookups: MapLookups): MapPointStation {
  const { station } = match;
  return createMapPointStation(
    {
      id: station.id,
      siteId: station.siteId,
      operatorId: station.operatorId,
      status: "active",
      statusChangedAt: station.statusChangedAt,
    },
    lookups,
  );
}

function toMatchedPoint(match: MatchedStation, lookups: MapLookups): MapPoint {
  const { location } = match.station;
  return {
    source: "internal",
    id: location.id,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city,
    address: location.address,
    regionName: lookups.regionsById.get(location.regionId)?.name ?? null,
    stations: [toMatchedPointStation(match, lookups)],
  };
}

export function mergeMatchedStationPoints(points: readonly MapPoint[], matches: readonly MatchedStation[], lookups: MapLookups): MapPoint[] {
  const merged = [...points];
  const indexByPointId = new Map<number, number>(merged.map((point, index) => [point.id, index]));

  for (const match of matches) {
    const index = indexByPointId.get(match.station.location.id);
    if (index === undefined) {
      const point = toMatchedPoint(match, lookups);
      indexByPointId.set(point.id, merged.length);
      merged.push(point);
      continue;
    }

    const point = merged[index];
    if (point.stations.some((station) => station.id === match.station.id)) continue;
    merged[index] = { ...point, stations: sortLocationStations([...point.stations, toMatchedPointStation(match, lookups)]) };
  }

  return merged;
}
