import { calculateDistance } from "@openbts/shared/radiolinesUtils";
import type { FeatureCollection } from "geojson";

import { type PickerLocation, type PickerStation, roundCoordinate } from "../../data/places";
import { PICKER_NEARBY_RADIUS_METERS } from "@/features/map/constants";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { type MapPoint, type MapPointStation, createMapPointStation, toMapPlace } from "@/features/map/data/mapPoints";
import { toMapPointFeature } from "@/features/map/geojson";
import { sortLocationStations } from "@/features/station-details/station/utils/stations";
import type { PlacePoint } from "@/lib/geo/geocoding";

export type NearbyLocation = {
  location: PickerLocation;
  distance: number;
};

const MOST_NEARBY_LOCATIONS = 5;

function toPickerPointStation(station: PickerStation, lookups: MapLookups): MapPointStation {
  return createMapPointStation(
    {
      id: station.id,
      siteId: station.siteId,
      operatorId: station.operatorId,
      azimuths: station.sectors?.map((sector) => sector.azimuth),
    },
    lookups,
  );
}

export function pickerLocationToMapPoint(location: PickerLocation, lookups: MapLookups): MapPoint {
  return {
    ...toMapPlace(location, lookups),
    source: "internal",
    countryCode: location.countryCode,
    stations: sortLocationStations(location.stations.map((station) => toPickerPointStation(station, lookups))),
  };
}

function isPlacedPoint(point: MapPoint): boolean {
  return point.latitude !== 0 && point.longitude !== 0;
}

export function hasStations(point: MapPoint): boolean {
  return point.stations.length > 0;
}

export function toPickerGeoJSON(points: readonly MapPoint[]): FeatureCollection {
  return { type: "FeatureCollection", features: points.filter(isPlacedPoint).map(toMapPointFeature) };
}

export function isSamePoint(left: PlacePoint, right: PlacePoint): boolean {
  return roundCoordinate(left.latitude) === roundCoordinate(right.latitude) && roundCoordinate(left.longitude) === roundCoordinate(right.longitude);
}

export function findLocationAt(locations: readonly PickerLocation[], point: PlacePoint | null): PickerLocation | null {
  if (point === null) return null;
  return locations.find((location) => isSamePoint(location, point)) ?? null;
}

export function listNearbyLocations(point: PlacePoint, locations: readonly PickerLocation[]): NearbyLocation[] {
  const nearby: NearbyLocation[] = [];
  for (const location of locations) {
    const distance = calculateDistance(point.latitude, point.longitude, location.latitude, location.longitude);
    if (distance <= PICKER_NEARBY_RADIUS_METERS) nearby.push({ location, distance });
  }
  return nearby.sort((left, right) => left.distance - right.distance).slice(0, MOST_NEARBY_LOCATIONS);
}
