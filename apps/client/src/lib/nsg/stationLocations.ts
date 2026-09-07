import type { LocationWithStations, StationWithoutCells } from "@/types/station";

import type { NsgMatchedStation } from "./stationCorrelation";

function toStation(match: NsgMatchedStation): StationWithoutCells {
  const { station } = match;
  return {
    id: station.id,
    station_id: station.station_id,
    operator_id: station.operator.id,
    notes: station.notes,
    extra_address: station.extra_address,
    updatedAt: station.updatedAt,
    createdAt: station.createdAt,
    is_confirmed: station.is_confirmed ?? false,
    status: "published",
    statusChangedAt: station.statusChangedAt,
    operator: station.operator,
  };
}

function toLocation(match: NsgMatchedStation): LocationWithStations {
  const { location } = match.station;
  return {
    id: location.id,
    city: location.city ?? undefined,
    address: location.address ?? undefined,
    longitude: location.longitude,
    latitude: location.latitude,
    updatedAt: location.updatedAt,
    createdAt: location.createdAt,
    region: location.region,
    stations: [toStation(match)],
  };
}

export function mergeNsgMatchedStationLocations(
  locations: readonly LocationWithStations[],
  matches: readonly NsgMatchedStation[],
): LocationWithStations[] {
  const merged = locations.map((location) => ({ ...location, stations: [...location.stations] }));
  const locationById = new Map(merged.map((location) => [location.id, location]));

  const mergeMatch = (match: NsgMatchedStation) => {
    const existing = locationById.get(match.station.location.id);
    if (!existing) {
      const location = toLocation(match);
      merged.push(location);
      locationById.set(location.id, location);
      return;
    }
    if (existing.stations.some((station) => station.id === match.station.id)) return;
    existing.stations.push(toStation(match));
  };

  for (const match of matches) mergeMatch(match);

  return merged;
}
