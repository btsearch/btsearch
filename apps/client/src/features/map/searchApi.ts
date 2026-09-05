import { postApiData } from "@/lib/api";
import { forwardGeocode } from "@/lib/geo/geocoding";
import type { Location, Operator, Station } from "@/types/station";

import { POLAND_BOUNDS } from "./constants";
import type { OSMResult } from "./types";

const GPS_REGEX = /([+-]?\d+\.\d+)[,\s]+\s*([+-]?\d+\.\d+)/;

export function parseGpsCoordinates(query: string): { lat: number; lng: number } | null {
  const match = query.match(GPS_REGEX);
  if (!match) return null;
  const lat = Number.parseFloat(match[1]!);
  const lng = Number.parseFloat(match[2]!);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lng < POLAND_BOUNDS[0][0] || lat < POLAND_BOUNDS[0][1] || lng > POLAND_BOUNDS[1][0] || lat > POLAND_BOUNDS[1][1]) return null;
  return { lat, lng };
}

type SearchOperator = Omit<Operator, "mnc"> & { mnc: number | null };
type SearchLocation = Omit<Location, "city" | "address"> & { city: string | null; address: string | null };

export type SearchStation = Omit<Station, "operator_id" | "operator" | "location" | "is_confirmed" | "status" | "statusChangedAt"> & {
  operator: SearchOperator | null;
  location: SearchLocation | null;
  is_confirmed: boolean | null;
  status: NonNullable<Station["status"]>;
  statusChangedAt: string;
};

export const searchStations = (query: string) => postApiData<SearchStation[], { query: string }>("search", { query });

export type UkeSearchPermit = {
  id: number;
  decision_number: string;
  decision_type: "zmP" | "P";
  expiry_date: string;
  band_id: number;
  source: "permits" | "device_registry";
  updatedAt: string;
  createdAt: string;
};

export type UkeSearchPermitStation = {
  id: number;
  station_id: string;
  operator: SearchOperator | null;
  location: {
    id: number;
    region_id: number;
    city: string | null;
    address: string | null;
    longitude: number;
    latitude: number;
    updatedAt: string;
    createdAt: string;
  } | null;
  permits: UkeSearchPermit[];
};

export type UkeSearchRadioline = {
  id: number;
  permit_number: string;
  operator: { id: number; name: string; full_name: string; mnc?: number | null } | null;
  tx: { city: string | null; latitude: number; longitude: number };
  rx: { city: string | null; latitude: number; longitude: number };
};

export type UkeSearchResult = {
  stations: UkeSearchPermitStation[];
  radiolines: UkeSearchRadioline[];
};

export const searchUkePermits = (query: string) => postApiData<UkeSearchResult, { query: string }>("uke/search", { query });

export async function searchLocations(query: string): Promise<OSMResult[]> {
  if (query.length < 3) return [];
  const results = await forwardGeocode(query);
  return results.slice(0, 5);
}
