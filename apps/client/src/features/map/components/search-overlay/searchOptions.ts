import type { MicrowaveLink, OfficialSite } from "@openbts/shared/contract";

import type { StationSearchHit } from "../../searchApi";
import type { FilterKeyword } from "../../types";
import type { GeocodedPlace, GeocodingSource } from "@/lib/geo/geocoding";

type GpsSearchResult = {
  lat: number;
  lng: number;
  address: string | null;
};

type FilterSearchOption = { kind: "filter"; key: string; keyword: FilterKeyword };
type GpsSearchOption = { kind: "gps"; key: string; result: GpsSearchResult };
type LocationSearchOption = { kind: "location"; key: string; result: GeocodedPlace };
type StationSearchOption = { kind: "station"; key: string; result: StationSearchHit };
type OfficialSiteSearchOption = { kind: "official-site"; key: string; result: OfficialSite };
type MicrowaveLinkSearchOption = { kind: "microwave-link"; key: string; result: MicrowaveLink };

export type SearchResultOption = GpsSearchOption | LocationSearchOption | StationSearchOption | OfficialSiteSearchOption | MicrowaveLinkSearchOption;

export type SearchOption = FilterSearchOption | SearchResultOption;

export type SearchResultGroup =
  | { kind: "gps"; options: GpsSearchOption[]; source: GeocodingSource | null }
  | { kind: "location"; options: LocationSearchOption[]; source: GeocodingSource | null }
  | { kind: "station"; options: StationSearchOption[] }
  | { kind: "official-site"; options: OfficialSiteSearchOption[] }
  | { kind: "microwave-link"; options: MicrowaveLinkSearchOption[] };

type SearchResultCapabilities = {
  location: boolean;
  station: boolean;
  officialSite: boolean;
  microwaveLink: boolean;
};

type BuildSearchResultOptionsArgs = {
  gpsResult: GpsSearchResult | null;
  gpsSource: GeocodingSource | null;
  locationResults: GeocodedPlace[];
  locationSource: GeocodingSource | null;
  stationResults: StationSearchHit[];
  officialSiteResults: OfficialSite[];
  microwaveLinkResults: MicrowaveLink[];
  capabilities: SearchResultCapabilities;
};

type BuiltSearchResults = {
  options: SearchResultOption[];
  groups: SearchResultGroup[];
};

export function buildAutocompleteOptions(keywords: FilterKeyword[]): SearchOption[] {
  return keywords.map((keyword) => ({ kind: "filter", key: `filter:${keyword.key}`, keyword }));
}

export function buildSearchResultOptions({
  gpsResult,
  gpsSource,
  locationResults,
  locationSource,
  stationResults,
  officialSiteResults,
  microwaveLinkResults,
  capabilities,
}: BuildSearchResultOptionsArgs): BuiltSearchResults {
  const gpsOptions: GpsSearchOption[] =
    capabilities.location && gpsResult ? [{ kind: "gps", key: `gps:${gpsResult.lat}:${gpsResult.lng}`, result: gpsResult }] : [];
  const locationOptions: LocationSearchOption[] = capabilities.location
    ? locationResults.map((result) => ({ kind: "location", key: `location:${result.id}`, result }))
    : [];
  const stationOptions: StationSearchOption[] = capabilities.station
    ? stationResults.map((result) => ({ kind: "station", key: `station:${result.id}`, result }))
    : [];
  const officialSiteOptions: OfficialSiteSearchOption[] = capabilities.officialSite
    ? officialSiteResults.map((result) => ({ kind: "official-site", key: `official-site:${result.id}`, result }))
    : [];
  const microwaveLinkOptions: MicrowaveLinkSearchOption[] = capabilities.microwaveLink
    ? microwaveLinkResults.map((result) => ({ kind: "microwave-link", key: `microwave-link:${result.id}`, result }))
    : [];
  const groups: SearchResultGroup[] = [];
  if (gpsOptions.length > 0) groups.push({ kind: "gps", options: gpsOptions, source: gpsSource });
  if (locationOptions.length > 0) groups.push({ kind: "location", options: locationOptions, source: locationSource });
  if (stationOptions.length > 0) groups.push({ kind: "station", options: stationOptions });
  if (officialSiteOptions.length > 0) groups.push({ kind: "official-site", options: officialSiteOptions });
  if (microwaveLinkOptions.length > 0) groups.push({ kind: "microwave-link", options: microwaveLinkOptions });
  const options: SearchResultOption[] = [];
  for (const group of groups) options.push(...group.options);

  return { options, groups };
}

export function getSearchOptionId(listboxId: string, optionKey: string): string {
  return `${listboxId}-option-${encodeURIComponent(optionKey)}`;
}
