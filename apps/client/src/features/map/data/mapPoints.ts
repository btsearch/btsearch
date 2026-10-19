import type {
  Brand,
  Location,
  LocationStation,
  OfficialLocation,
  OfficialLocationSite,
  OfficialSite,
  OfficialSiteLocation,
  Operator,
  Sector,
  StationCell,
  StationIdentifier,
  StationStatus,
} from "@openbts/shared/contract";
import { useMemo } from "react";

import type { MapLocationRecord, MapLocationsPage } from "../api";
import { isOfficialSiteExpired } from "../utils";
import { type MapLookups, getOperatorLook } from "./mapLookups";
import type { LocationRecord } from "@/features/station-details/station/types";
import { sortLocationStations } from "@/features/station-details/station/utils/stations";
import type { StationSource } from "@/types/station";

export type MapStationGuest = { operatorId: number; name: string; code: string | null; brand: Brand | null; color: string };

export type MapPointStation = {
  id: number;
  siteId: string | null;
  nodeName: string | null;
  operatorId: number | null;
  operator: Operator | null;
  operatorName: string | null;
  brand: Brand | null;
  color: string;
  guests: readonly MapStationGuest[];
  status: StationStatus | null;
  statusChangedAt: string | null;
  hostStationId: number | null;
  identifiers: readonly StationIdentifier[];
  azimuths: readonly (number | null)[];
  officialSite: OfficialSite | null;
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
  structure?: Location["structure"];
  stations: MapPointStation[];
  isUnlisted?: boolean;
};

export type MapPlace = Pick<MapPoint, "id" | "city" | "address" | "regionName" | "latitude" | "longitude" | "structure">;

export type MapPopupStation = MapPointStation & { cells: readonly StationCell[] };

export type MapPointStationSeed = {
  id: number;
  siteId: string | null;
  nodeName: string | null;
  operatorId: number | null;
  operatorName?: string | null;
  guestOperatorIds?: readonly number[];
  status?: StationStatus | null;
  statusChangedAt?: string | null;
  hostStationId?: number | null;
  identifiers?: readonly StationIdentifier[];
  azimuths?: readonly (number | null)[];
  officialSite?: OfficialSite | null;
};

type ListedStationRecord = Pick<
  LocationStation,
  "id" | "siteId" | "nodeName" | "operatorId" | "guestOperatorIds" | "status" | "statusChangedAt" | "hostStationId" | "identifiers"
> & {
  sectors?: Sector[];
};

type PlacedLocationRecord = Pick<Location, "id" | "city" | "address" | "regionId" | "latitude" | "longitude" | "structure">;

const OMNIDIRECTIONAL_REGISTER_AZIMUTH = 360;
const NO_IDENTIFIERS: readonly StationIdentifier[] = [];
const NO_AZIMUTHS: readonly (number | null)[] = [];
const NO_POINTS: MapPoint[] = [];

function toMapAzimuth(registerAzimuth: number): number | null {
  return registerAzimuth === OMNIDIRECTIONAL_REGISTER_AZIMUTH ? null : registerAzimuth;
}

function listGuests(operatorIds: readonly number[], lookups: MapLookups): MapStationGuest[] {
  return operatorIds.flatMap((operatorId) => {
    const { operator, brand, color } = getOperatorLook(lookups, operatorId);
    return operator === null ? [] : [{ operatorId, name: operator.name, code: operator.primaryPlmn, brand, color }];
  });
}

export function createMapPointStation(seed: MapPointStationSeed, lookups: MapLookups): MapPointStation {
  const operatorLook = getOperatorLook(lookups, seed.operatorId);

  return {
    id: seed.id,
    siteId: seed.siteId,
    nodeName: seed.nodeName,
    operatorId: seed.operatorId,
    operator: operatorLook.operator,
    operatorName: operatorLook.operator?.name ?? seed.operatorName ?? null,
    brand: operatorLook.brand,
    color: operatorLook.color,
    guests: listGuests(seed.guestOperatorIds ?? [], lookups),
    status: seed.status ?? null,
    statusChangedAt: seed.statusChangedAt ?? null,
    hostStationId: seed.hostStationId ?? null,
    identifiers: seed.identifiers ?? NO_IDENTIFIERS,
    azimuths: seed.azimuths ?? NO_AZIMUTHS,
    officialSite: seed.officialSite ?? null,
  };
}

export function toMapPlace(location: PlacedLocationRecord, lookups: MapLookups): MapPlace {
  return {
    id: location.id,
    city: location.city,
    address: location.address,
    structure: location.structure,
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
      nodeName: station.nodeName,
      operatorId: station.operatorId,
      operatorName: fallbackOperatorName,
      guestOperatorIds: station.guestOperatorIds,
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

function listOfficialSiteAzimuths(site: OfficialLocationSite): (number | null)[] {
  return (site.permits ?? []).flatMap((permit) =>
    (permit.sectors ?? []).flatMap((sector) => (sector.azimuth === null ? [] : [toMapAzimuth(sector.azimuth)])),
  );
}

function officialSiteToMapPointStation(site: OfficialLocationSite, place: OfficialSiteLocation, lookups: MapLookups): MapPointStation {
  return createMapPointStation(
    {
      id: site.id,
      siteId: site.siteId ?? "",
      nodeName: null,
      operatorId: site.operatorId,
      azimuths: listOfficialSiteAzimuths(site),
      officialSite: { ...site, location: place },
    },
    lookups,
  );
}

export function toOfficialMapPlace(location: OfficialSiteLocation, lookups: MapLookups | undefined): MapPlace {
  return {
    id: location.id,
    city: location.city,
    address: location.address,
    regionName: location.regionId === null ? null : (lookups?.regionsById.get(location.regionId)?.name ?? null),
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export function officialLocationToMapPoint(location: OfficialLocation, lookups: MapLookups): MapPoint {
  const { sites = [], ...place } = location;

  return {
    ...toOfficialMapPlace(place, lookups),
    source: "official",
    countryCode: place.countryCode,
    stations: sortLocationStations(sites.map((site) => officialSiteToMapPointStation(site, place, lookups))),
  };
}

function toMapPoints(page: MapLocationsPage, lookups: MapLookups): MapPoint[] {
  if (page.source === "official") return page.locations.map((location) => officialLocationToMapPoint(location, lookups));
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
  return station.officialSite !== null && isOfficialSiteExpired(station.officialSite);
}

export function listOfficialSites(point: MapPoint): OfficialSite[] {
  return point.stations.flatMap((station) => (station.officialSite === null ? [] : [station.officialSite]));
}
