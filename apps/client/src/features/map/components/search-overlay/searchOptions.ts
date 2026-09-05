import type { GeocodingResult } from "@/lib/geo/geocoding";

import type { SearchStation, UkeSearchPermitStation, UkeSearchRadioline } from "../../searchApi";
import type { FilterKeyword } from "../../types";

export type GpsSearchResult = {
  lat: number;
  lng: number;
  address: string | null;
};

type FilterSearchOption = { kind: "filter"; key: string; keyword: FilterKeyword };
type GpsSearchOption = { kind: "gps"; key: string; result: GpsSearchResult };
type LocationSearchOption = { kind: "location"; key: string; result: GeocodingResult };
type StationSearchOption = { kind: "station"; key: string; result: SearchStation };
type PermitSearchOption = { kind: "permit"; key: string; result: UkeSearchPermitStation };
type RadiolineSearchOption = { kind: "radioline"; key: string; result: UkeSearchRadioline };

export type SearchResultOption = GpsSearchOption | LocationSearchOption | StationSearchOption | PermitSearchOption | RadiolineSearchOption;

export type SearchOption = FilterSearchOption | SearchResultOption;

export type SearchResultGroup =
  | { kind: "gps"; options: GpsSearchOption[] }
  | { kind: "location"; options: LocationSearchOption[] }
  | { kind: "station"; options: StationSearchOption[] }
  | { kind: "permit"; options: PermitSearchOption[] }
  | { kind: "radioline"; options: RadiolineSearchOption[] };

type SearchResultCapabilities = {
  location: boolean;
  station: boolean;
  permit: boolean;
  radioline: boolean;
};

type BuildSearchResultOptionsArgs = {
  gpsResult: GpsSearchResult | null;
  locationResults: GeocodingResult[];
  stationResults: SearchStation[];
  permitResults: UkeSearchPermitStation[];
  radiolineResults: UkeSearchRadioline[];
  capabilities: SearchResultCapabilities;
};

export type BuiltSearchResults = {
  options: SearchResultOption[];
  groups: SearchResultGroup[];
  stationTotalCount: number;
};

const MAX_STATION_RESULTS = 15;

export function buildAutocompleteOptions(keywords: FilterKeyword[]): SearchOption[] {
  return keywords.map((keyword) => ({ kind: "filter", key: `filter:${keyword.key}`, keyword }));
}

export function buildSearchResultOptions({
  gpsResult,
  locationResults,
  stationResults,
  permitResults,
  radiolineResults,
  capabilities,
}: BuildSearchResultOptionsArgs): BuiltSearchResults {
  const gpsOptions: GpsSearchOption[] =
    capabilities.location && gpsResult ? [{ kind: "gps", key: `gps:${gpsResult.lat}:${gpsResult.lng}`, result: gpsResult }] : [];
  const locationOptions: LocationSearchOption[] = capabilities.location
    ? locationResults.map((result) => ({ kind: "location", key: `location:${result.place_id}`, result }))
    : [];
  const stationOptions: StationSearchOption[] = capabilities.station
    ? stationResults.slice(0, MAX_STATION_RESULTS).map((result) => ({ kind: "station", key: `station:${result.id}`, result }))
    : [];
  const permitOptions: PermitSearchOption[] = capabilities.permit
    ? permitResults.map((result) => ({ kind: "permit", key: `permit:${result.id}`, result }))
    : [];
  const radiolineOptions: RadiolineSearchOption[] = capabilities.radioline
    ? radiolineResults.map((result) => ({ kind: "radioline", key: `radioline:${result.id}`, result }))
    : [];
  const groups: SearchResultGroup[] = [];
  if (gpsOptions.length > 0) groups.push({ kind: "gps", options: gpsOptions });
  if (locationOptions.length > 0) groups.push({ kind: "location", options: locationOptions });
  if (stationOptions.length > 0) groups.push({ kind: "station", options: stationOptions });
  if (permitOptions.length > 0) groups.push({ kind: "permit", options: permitOptions });
  if (radiolineOptions.length > 0) groups.push({ kind: "radioline", options: radiolineOptions });
  const options: SearchResultOption[] = [];
  for (const group of groups) options.push(...group.options);

  return {
    options,
    groups,
    stationTotalCount: capabilities.station ? stationResults.length : 0,
  };
}

export function getSearchOptionId(listboxId: string, optionKey: string): string {
  return `${listboxId}-option-${encodeURIComponent(optionKey)}`;
}
