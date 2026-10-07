import type { StationStatus } from "@openbts/shared/contract";

import type { LocationsListPageData, LocationsListRecord, LocationsListStationRecord } from "./locationsListRequests";
import type { BrandLook } from "@/components/cellular/brandMark";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { sortLocationStations, toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { type ListRowStructure, toListRowStructure, toShownText } from "@/features/stations/list/data/listStructures";
import type { StationStatus as V1StationStatus } from "@/types/station";

export type LocationsListRowStation = {
  id: number;
  siteId: string;
  brand: BrandLook | null | undefined;
  operatorName: string | null;
  status: StationStatus;
  badgeStatus: V1StationStatus | null;
};

export type LocationsListRow = {
  id: number;
  countryCode: string;
  city: string | null;
  address: string | null;
  regionName: string;
  structure: ListRowStructure;
  latitude: number;
  longitude: number;
  stations: LocationsListRowStation[];
  updatedAt: string;
  createdAt: string;
  location: LocationsListRecord;
};

const NO_ROWS: LocationsListRow[] = [];

function toLocationsListRowStation(station: LocationsListStationRecord, lookups: MapLookups | undefined): LocationsListRowStation {
  return {
    id: station.id,
    siteId: station.siteId,
    brand: lookups === undefined ? undefined : getOperatorBrand(station.operator, lookups.brands),
    operatorName: station.operator?.name ?? null,
    status: station.status,
    badgeStatus: station.status === "active" ? null : toV1StationStatus(station.status),
  };
}

function toLocationsListRow(location: LocationsListRecord, lookups: MapLookups | undefined): LocationsListRow {
  return {
    id: location.id,
    countryCode: location.countryCode,
    city: toShownText(location.city),
    address: toShownText(location.address),
    regionName: location.region.name,
    structure: toListRowStructure(location.structure),
    latitude: location.latitude,
    longitude: location.longitude,
    stations: sortLocationStations(location.stations).map((station) => toLocationsListRowStation(station, lookups)),
    updatedAt: location.updatedAt,
    createdAt: location.createdAt,
    location,
  };
}

export function toLocationsListRows(page: LocationsListPageData | undefined, lookups: MapLookups | undefined): LocationsListRow[] {
  if (page === undefined) return NO_ROWS;
  return page.locations.map((location) => toLocationsListRow(location, lookups));
}
