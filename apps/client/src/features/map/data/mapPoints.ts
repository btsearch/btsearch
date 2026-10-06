import type { Brand, Cell, Location, LocationStation, Operator, Sector, StationIdentifier, StationStatus } from "@openbts/shared/contract";
import { useMemo } from "react";

import type { MapLocationRecord, MapLocationsPage } from "../api";
import { REGISTER_COUNTRY_CODE } from "../constants";
import { attachUkeLocationToStations, isUkeStationExpired } from "../utils";
import { type MapLookups, getOperatorLook } from "./mapLookups";
import type { LocationRecord } from "@/features/station-details/station/types";
import { sortLocationStations } from "@/features/station-details/station/utils/stations";
import type { StationSource, UkeLocationWithPermits, UkeStation } from "@/types/station";

export type MapPointStation = {
  id: number;
  siteId: string;
  operatorId: number | null;
  operator: Operator | null;
  operatorName: string | null;
  brand: Brand | null;
  color: string;
  status: StationStatus | null;
  statusChangedAt: string | null;
  hostStationId: number | null;
  identifiers: readonly StationIdentifier[];
  azimuths: readonly (number | null)[];
  registerStation: UkeStation | null;
};

export type MapPoint = {
  source: StationSource;
  id: number;
  countryCode: string;
  latitude: number;
  longitude: number;
  city: string | null;
  address: string | null;
  regionName: string | null;
  stations: MapPointStation[];
  isUnlisted?: boolean;
};

export type MapPlace = Pick<MapPoint, "id" | "city" | "address" | "regionName" | "latitude" | "longitude">;

export type MapPopupStation = MapPointStation & { cells: readonly Cell[] };

export type MapPointStationSeed = {
  id: number;
  siteId: string;
  operatorId: number | null;
  operatorName?: string | null;
  status?: StationStatus | null;
  statusChangedAt?: string | null;
  hostStationId?: number | null;
  identifiers?: readonly StationIdentifier[];
  azimuths?: readonly (number | null)[];
  registerStation?: UkeStation | null;
};

type ListedStationRecord = Pick<LocationStation, "id" | "siteId" | "operatorId" | "status" | "statusChangedAt" | "hostStationId" | "identifiers"> & {
  sectors?: Sector[];
};

type PlacedLocationRecord = Pick<Location, "id" | "city" | "address" | "regionId" | "latitude" | "longitude">;

const V1_OMNIDIRECTIONAL_AZIMUTH = 360;
const NO_IDENTIFIERS: readonly StationIdentifier[] = [];
const NO_AZIMUTHS: readonly (number | null)[] = [];
const NO_POINTS: MapPoint[] = [];

export function toV2Azimuth(v1Azimuth: number): number | null {
  return v1Azimuth === V1_OMNIDIRECTIONAL_AZIMUTH ? null : v1Azimuth;
}

export function createMapPointStation(seed: MapPointStationSeed, lookups: MapLookups): MapPointStation {
  const operatorLook = getOperatorLook(lookups, seed.operatorId);

  return {
    id: seed.id,
    siteId: seed.siteId,
    operatorId: seed.operatorId,
    operator: operatorLook.operator,
    operatorName: operatorLook.operator?.name ?? seed.operatorName ?? null,
    brand: operatorLook.brand,
    color: operatorLook.color,
    status: seed.status ?? null,
    statusChangedAt: seed.statusChangedAt ?? null,
    hostStationId: seed.hostStationId ?? null,
    identifiers: seed.identifiers ?? NO_IDENTIFIERS,
    azimuths: seed.azimuths ?? NO_AZIMUTHS,
    registerStation: seed.registerStation ?? null,
  };
}

export function toMapPlace(location: PlacedLocationRecord, lookups: MapLookups): MapPlace {
  return {
    id: location.id,
    city: location.city,
    address: location.address,
    regionName: lookups.regionsById.get(location.regionId)?.name ?? null,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function toMapPointStation(station: ListedStationRecord, lookups: MapLookups, fallbackOperatorName?: string | null): MapPointStation {
  return createMapPointStation(
    {
      id: station.id,
      siteId: station.siteId,
      operatorId: station.operatorId,
      operatorName: fallbackOperatorName,
      status: station.status,
      statusChangedAt: station.statusChangedAt,
      hostStationId: station.hostStationId,
      identifiers: station.identifiers,
      azimuths: station.sectors?.map((sector) => sector.azimuth),
    },
    lookups,
  );
}

export function locationRecordToMapPoint(location: MapLocationRecord, lookups: MapLookups): MapPoint {
  return {
    ...toMapPlace(location, lookups),
    source: "internal",
    countryCode: location.countryCode,
    stations: sortLocationStations(location.stations.map((station) => toMapPointStation(station, lookups))),
  };
}

function listRegisterAzimuths(station: UkeStation): (number | null)[] {
  return station.permits.flatMap((permit) =>
    (permit.sectors ?? []).flatMap((sector) => {
      if (sector.azimuth === null) return [];
      return [toV2Azimuth(sector.azimuth)];
    }),
  );
}

function registerStationToMapPointStation(station: UkeStation, lookups: MapLookups): MapPointStation {
  return createMapPointStation(
    {
      id: station.id,
      siteId: station.station_id,
      operatorId: station.operator?.id ?? null,
      operatorName: station.operator?.name,
      azimuths: listRegisterAzimuths(station),
      registerStation: station,
    },
    lookups,
  );
}

export function registerLocationToMapPoint(location: UkeLocationWithPermits, lookups: MapLookups): MapPoint {
  const stations = attachUkeLocationToStations(location.stations, location);

  return {
    source: "uke",
    id: location.id,
    countryCode: REGISTER_COUNTRY_CODE,
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city,
    address: location.address,
    regionName: location.region.name,
    stations: sortLocationStations(stations.map((station) => registerStationToMapPointStation(station, lookups))),
  };
}

function toMapPoints(page: MapLocationsPage, lookups: MapLookups): MapPoint[] {
  if (page.source === "uke") return page.locations.map((location) => registerLocationToMapPoint(location, lookups));
  return page.locations.map((location) => locationRecordToMapPoint(location, lookups));
}

export function useMapPoints(page: MapLocationsPage | undefined, lookups: MapLookups | undefined): MapPoint[] {
  return useMemo(() => (page === undefined || lookups === undefined ? NO_POINTS : toMapPoints(page, lookups)), [page, lookups]);
}

export function toMapPopupStations(location: LocationRecord, lookups: MapLookups): MapPopupStation[] {
  return sortLocationStations(
    location.stations.map((station) => ({ ...toMapPointStation(station, lookups, station.operator?.name), cells: station.cells })),
  );
}

export function isMapPointStationExpired(station: MapPointStation): boolean {
  return station.registerStation !== null && isUkeStationExpired(station.registerStation);
}

export function listRegisterStations(point: MapPoint): UkeStation[] {
  return point.stations.flatMap((station) => (station.registerStation === null ? [] : [station.registerStation]));
}
