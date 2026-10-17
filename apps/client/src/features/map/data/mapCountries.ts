import type { Country, CountryCapabilities, Region } from "@openbts/shared/contract";
import { keepPreviousData, queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { POLAND_BOUNDS } from "../constants";
import { type MapBox, type MapBoxCenter, getMapBoxCenter, parseV1Bounds, toV2Bbox } from "./mapBox";
import { type MapCountryCapability, type MapFilters, type MapFiltersUpdater, changeMapFilterSource } from "./mapFilters";
import type { MapPoint } from "./mapPoints";
import { countriesQueryOptions } from "@/features/shared/lookups";
import { fetchV2Data } from "@/lib/api";
import { getCountryName } from "@/lib/geo/countryName";

export type MapCapabilities = Pick<CountryCapabilities, MapCountryCapability>;

export type MapCountries = {
  onScreen: readonly string[];
  first: string | null;
  capabilities: MapCapabilities;
};

export type CapabilitiesOnScreen = {
  capabilities: MapCapabilities;
  isOfficialLookupDone: boolean;
};

export type BoxCountrySources = {
  regions: readonly Pick<Region, "countryCode">[] | undefined;
  countries: readonly Country[] | undefined;
  isBoxLookupDone: boolean;
  isCountriesLookupDone: boolean;
};

type CountryPlace = Pick<MapPoint, "countryCode" | "latitude" | "longitude">;

type UseMapCountriesArgs = {
  bounds: string;
  points: readonly MapPoint[];
};

const REGIONS_IN_BOX_STALE_TIME = 1000 * 60 * 5;
const REGIONS_IN_BOX_GC_TIME = 1000 * 60;
const DEGREES_TO_RADIANS = Math.PI / 180;
const FULL_TURN_DEGREES = 360;
const COUNTRY_EXTENT_MARGIN_DEGREES = 1;
const POLAND_COUNTRY_CODE = "PL";
const POLAND_FALLBACK_EXTENT: MapBox = {
  west: POLAND_BOUNDS[0][0],
  south: POLAND_BOUNDS[0][1],
  east: POLAND_BOUNDS[1][0],
  north: POLAND_BOUNDS[1][1],
};
export const NO_MAP_CAPABILITIES: MapCapabilities = { official: false, microwaveLinks: false, emf: false };
const filtersOnDatabaseSource = new WeakMap<MapFilters, MapFilters>();
const filtersWithoutMicrowaveLinks = new WeakMap<MapFilters, MapFilters>();
const filtersWithoutPlannedMeasurements = new WeakMap<MapFilters, MapFilters>();
let lastMapCountries: MapCountries | undefined;

function fetchRegionsInBox(bbox: string, signal?: AbortSignal): Promise<Region[]> {
  return fetchV2Data<Region[]>(`regions?${new URLSearchParams({ bbox }).toString()}`, { signal });
}

function regionsInBoxQueryOptions(bounds: string) {
  const bbox = toV2Bbox(bounds);

  return queryOptions({
    queryKey: ["regions", "v2", "bbox", bbox] as const,
    queryFn: bbox === null ? skipToken : ({ signal }) => fetchRegionsInBox(bbox, signal),
    staleTime: REGIONS_IN_BOX_STALE_TIME,
    gcTime: REGIONS_IN_BOX_GC_TIME,
  });
}

export function sortCountryCodesByName(countryCodes: readonly string[], language: string): string[] {
  return [...countryCodes].sort((left, right) => getCountryName(left, language).localeCompare(getCountryName(right, language), language));
}

function listCountryCodesOnScreen(
  regions: readonly Pick<Region, "countryCode">[] | undefined,
  points: readonly Pick<MapPoint, "countryCode">[],
  countries: readonly Country[] | undefined,
): string[] {
  const onScreen = new Set<string>();
  for (const region of regions ?? []) onScreen.add(region.countryCode);
  for (const point of points) onScreen.add(point.countryCode);

  if (onScreen.size === 0 && countries?.length === 1) onScreen.add(countries[0].code);
  return [...onScreen];
}

function findNearestPlace(places: readonly CountryPlace[], center: MapBoxCenter): CountryPlace | null {
  const longitudeScale = Math.cos(center.latitude * DEGREES_TO_RADIANS);
  let nearest: CountryPlace | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const place of places) {
    const latitudeGap = place.latitude - center.latitude;
    const longitudeGap = (place.longitude - center.longitude) * longitudeScale;
    const distance = latitudeGap * latitudeGap + longitudeGap * longitudeGap;
    if (distance < nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function findFirstCountryCode(
  countryCodes: readonly string[],
  points: readonly CountryPlace[],
  center: MapBoxCenter | null,
  language: string,
): string | null {
  const nearest = center === null ? null : findNearestPlace(points, center);
  if (nearest !== null && countryCodes.includes(nearest.countryCode)) return nearest.countryCode;
  return sortCountryCodesByName(countryCodes, language).at(0) ?? null;
}

function orderCountryCodesOnScreen(countryCodes: readonly string[], first: string | null, language: string): string[] {
  const rest = sortCountryCodesByName(
    countryCodes.filter((countryCode) => countryCode !== first),
    language,
  );
  return first !== null && countryCodes.includes(first) ? [first, ...rest] : rest;
}

function listCountriesInBox(
  regions: readonly Pick<Region, "countryCode">[] | undefined,
  countries: readonly Country[] | undefined,
): readonly Country[] {
  if (countries === undefined) return [];
  if (regions === undefined || regions.length === 0) return countries.length === 1 ? countries : [];

  const countryCodesInBox = new Set(regions.map((region) => region.countryCode));
  return countries.filter((country) => countryCodesInBox.has(country.code));
}

function getCountryExtent(country: Country): MapBox | null {
  if (country.defaultView !== null) return country.defaultView;
  return country.code === POLAND_COUNTRY_CODE ? POLAND_FALLBACK_EXTENT : null;
}

function touchesLongitudeSpan(box: MapBox, spanWest: number, spanEast: number): boolean {
  if (box.east - box.west >= FULL_TURN_DEGREES || spanEast - spanWest >= FULL_TURN_DEGREES) return true;

  const wholeTurns = Math.floor((box.west - spanWest) / FULL_TURN_DEGREES) * FULL_TURN_DEGREES;
  return box.west - wholeTurns <= spanEast || box.east - wholeTurns >= spanWest + FULL_TURN_DEGREES;
}

function isClearOfCountry(box: MapBox | null, country: Country): boolean {
  const extent = getCountryExtent(country);
  if (box === null || extent === null) return false;
  if (box.north < extent.south - COUNTRY_EXTENT_MARGIN_DEGREES || box.south > extent.north + COUNTRY_EXTENT_MARGIN_DEGREES) return true;

  const unwrappedEast = extent.east < extent.west ? extent.east + FULL_TURN_DEGREES : extent.east;
  return !touchesLongitudeSpan(box, extent.west - COUNTRY_EXTENT_MARGIN_DEGREES, unwrappedEast + COUNTRY_EXTENT_MARGIN_DEGREES);
}

function getMapCapabilities(
  box: MapBox | null,
  regions: readonly Pick<Region, "countryCode">[] | undefined,
  countries: readonly Country[] | undefined,
): MapCapabilities {
  const countriesOnScreen = listCountriesInBox(regions, countries).filter((country) => !isClearOfCountry(box, country));

  return {
    official: countriesOnScreen.some((country) => country.capabilities.official),
    microwaveLinks: countriesOnScreen.some((country) => country.capabilities.microwaveLinks),
    emf: countriesOnScreen.some((country) => country.capabilities.emf),
  };
}

function isOfficialLookupDone(box: MapBox | null, { countries, isBoxLookupDone, isCountriesLookupDone }: BoxCountrySources): boolean {
  if (!isCountriesLookupDone) return false;
  if (isBoxLookupDone || countries === undefined || countries.length === 1) return true;
  return countries.every((country) => !country.capabilities.official || isClearOfCountry(box, country));
}

function getMapCountries(
  bounds: string,
  regions: readonly Pick<Region, "countryCode">[] | undefined,
  points: readonly MapPoint[],
  countries: readonly Country[] | undefined,
  language: string,
): MapCountries {
  const box = parseV1Bounds(bounds);
  const countryCodes = listCountryCodesOnScreen(regions, points, countries);
  const first = findFirstCountryCode(countryCodes, points, box === null ? null : getMapBoxCenter(box), language);

  return {
    onScreen: orderCountryCodesOnScreen(countryCodes, first, language),
    first,
    capabilities: getMapCapabilities(box, regions, countries),
  };
}

function hasSameCountryCodes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((countryCode, index) => countryCode === right[index]);
}

function hasSameCapabilities(left: MapCapabilities, right: MapCapabilities): boolean {
  return left.official === right.official && left.microwaveLinks === right.microwaveLinks && left.emf === right.emf;
}

function hasSameCountries(left: MapCountries, right: MapCountries): boolean {
  return (
    left.first === right.first && hasSameCapabilities(left.capabilities, right.capabilities) && hasSameCountryCodes(left.onScreen, right.onScreen)
  );
}

function reuseLastMapCountries(mapCountries: MapCountries): MapCountries {
  if (lastMapCountries !== undefined && hasSameCountries(lastMapCountries, mapCountries)) return lastMapCountries;

  lastMapCountries = mapCountries;
  return mapCountries;
}

export function isMapSourceUndecided(filters: Pick<MapFilters, "source">, capabilitiesOnScreen: CapabilitiesOnScreen): boolean {
  return filters.source === "official" && !capabilitiesOnScreen.capabilities.official && !capabilitiesOnScreen.isOfficialLookupDone;
}

function withDatabaseSource(filters: MapFilters): MapFilters {
  return changeMapFilterSource(filters, "internal");
}

function withoutMicrowaveLinks(filters: MapFilters): MapFilters {
  return { ...filters, showRadiolines: false };
}

function withoutPlannedMeasurements(filters: MapFilters): MapFilters {
  return { ...filters, showPlannedMeasurements: false };
}

function reuseChangedFilters(knownChanges: WeakMap<MapFilters, MapFilters>, filters: MapFilters, change: MapFiltersUpdater): MapFilters {
  const knownFilters = knownChanges.get(filters);
  if (knownFilters !== undefined) return knownFilters;

  const changedFilters = change(filters);
  knownChanges.set(filters, changedFilters);
  return changedFilters;
}

export function getEffectiveMapFilters(filters: MapFilters, { capabilities }: Pick<MapCountries, "capabilities">): MapFilters {
  let shownFilters = filters;
  if (!capabilities.official && shownFilters.source === "official") {
    shownFilters = reuseChangedFilters(filtersOnDatabaseSource, shownFilters, withDatabaseSource);
  }
  if (!capabilities.microwaveLinks && shownFilters.showRadiolines) {
    shownFilters = reuseChangedFilters(filtersWithoutMicrowaveLinks, shownFilters, withoutMicrowaveLinks);
  }
  if (!capabilities.emf && shownFilters.showPlannedMeasurements) {
    shownFilters = reuseChangedFilters(filtersWithoutPlannedMeasurements, shownFilters, withoutPlannedMeasurements);
  }
  return shownFilters;
}

function useBoxCountrySources(bounds: string): BoxCountrySources {
  const countriesQuery = useQuery(countriesQueryOptions());
  const regionsQuery = useQuery({ ...regionsInBoxQueryOptions(bounds), placeholderData: keepPreviousData });

  return {
    regions: regionsQuery.data,
    countries: countriesQuery.data,
    isBoxLookupDone: !regionsQuery.isPlaceholderData && (regionsQuery.isSuccess || regionsQuery.isError),
    isCountriesLookupDone: countriesQuery.isSuccess || countriesQuery.isError,
  };
}

export function readCapabilitiesOnScreen(bounds: string, sources: BoxCountrySources): CapabilitiesOnScreen {
  const box = parseV1Bounds(bounds);

  return {
    capabilities: getMapCapabilities(box, sources.regions, sources.countries),
    isOfficialLookupDone: isOfficialLookupDone(box, sources),
  };
}

export function useCapabilitiesOnScreen(bounds: string): CapabilitiesOnScreen {
  const sources = useBoxCountrySources(bounds);
  return readCapabilitiesOnScreen(bounds, sources);
}

export function useMapCountries({ bounds, points }: UseMapCountriesArgs): MapCountries {
  const { i18n } = useTranslation();
  const { regions, countries } = useBoxCountrySources(bounds);
  const { language } = i18n;

  return useMemo(
    () => reuseLastMapCountries(getMapCountries(bounds, regions, points, countries, language)),
    [bounds, regions, points, countries, language],
  );
}
