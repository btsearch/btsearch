import type { Country, Region } from "@openbts/shared/contract";
import { keepPreviousData, queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { POLAND_BOUNDS, REGISTER_COUNTRY_CODE } from "../constants";
import { type MapBox, type MapBoxCenter, getMapBoxCenter, parseV1Bounds, toV2Bbox } from "./mapBox";
import { type MapFilters, changeMapFilterSource } from "./mapFilters";
import type { MapPoint } from "./mapPoints";
import { countriesQueryOptions } from "@/features/shared/lookups";
import { fetchV2Data } from "@/lib/api";
import { getCountryName } from "@/lib/geo/countryName";

export type MapCountries = {
  onScreen: readonly string[];
  first: string | null;
  isRegisterOnScreen: boolean;
};

export type RegisterOnScreen = {
  isRegisterOnScreen: boolean;
  isSettled: boolean;
};

type BoxCountrySources = {
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
const REGISTER_EXTENT_MARGIN_DEGREES = 1;
const REGISTER_FALLBACK_EXTENT: MapBox = {
  west: POLAND_BOUNDS[0][0],
  south: POLAND_BOUNDS[0][1],
  east: POLAND_BOUNDS[1][0],
  north: POLAND_BOUNDS[1][1],
};
const filtersWithoutRegisterData = new WeakMap<MapFilters, MapFilters>();
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

function isRegisterCountryInBox(regions: readonly Pick<Region, "countryCode">[] | undefined, countries: readonly Country[] | undefined): boolean {
  if (regions !== undefined && regions.length > 0) return regions.some((region) => region.countryCode === REGISTER_COUNTRY_CODE);
  return countries?.length === 1 && countries[0].code === REGISTER_COUNTRY_CODE;
}

function isRegisterOnScreenSettled({ regions, countries, isBoxLookupDone, isCountriesLookupDone }: BoxCountrySources): boolean {
  if (countries?.length === 1) return true;
  if (!isBoxLookupDone) return false;
  return isCountriesLookupDone || (regions !== undefined && regions.length > 0);
}

function getRegisterExtent(countries: readonly Country[] | undefined): MapBox {
  const registerCountry = countries?.find((country) => country.code === REGISTER_COUNTRY_CODE);
  return registerCountry?.defaultView ?? REGISTER_FALLBACK_EXTENT;
}

function touchesLongitudeSpan(box: MapBox, spanWest: number, spanEast: number): boolean {
  if (box.east - box.west >= FULL_TURN_DEGREES || spanEast - spanWest >= FULL_TURN_DEGREES) return true;

  const wholeTurns = Math.floor((box.west - spanWest) / FULL_TURN_DEGREES) * FULL_TURN_DEGREES;
  return box.west - wholeTurns <= spanEast || box.east - wholeTurns >= spanWest + FULL_TURN_DEGREES;
}

function isClearOfRegisterCountry(box: MapBox | null, countries: readonly Country[] | undefined): boolean {
  if (box === null) return false;

  const extent = getRegisterExtent(countries);
  if (box.north < extent.south - REGISTER_EXTENT_MARGIN_DEGREES || box.south > extent.north + REGISTER_EXTENT_MARGIN_DEGREES) return true;

  const unwrappedEast = extent.east < extent.west ? extent.east + FULL_TURN_DEGREES : extent.east;
  return !touchesLongitudeSpan(box, extent.west - REGISTER_EXTENT_MARGIN_DEGREES, unwrappedEast + REGISTER_EXTENT_MARGIN_DEGREES);
}

function isRegisterCountryOnScreen(
  box: MapBox | null,
  regions: readonly Pick<Region, "countryCode">[] | undefined,
  countries: readonly Country[] | undefined,
): boolean {
  return !isClearOfRegisterCountry(box, countries) && isRegisterCountryInBox(regions, countries);
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
    isRegisterOnScreen: isRegisterCountryOnScreen(box, regions, countries),
  };
}

function hasSameCountryCodes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((countryCode, index) => countryCode === right[index]);
}

function hasSameCountries(left: MapCountries, right: MapCountries): boolean {
  return left.first === right.first && left.isRegisterOnScreen === right.isRegisterOnScreen && hasSameCountryCodes(left.onScreen, right.onScreen);
}

function reuseLastMapCountries(mapCountries: MapCountries): MapCountries {
  if (lastMapCountries !== undefined && hasSameCountries(lastMapCountries, mapCountries)) return lastMapCountries;

  lastMapCountries = mapCountries;
  return mapCountries;
}

export function isMapSourceUndecided(filters: Pick<MapFilters, "source">, registerOnScreen: RegisterOnScreen): boolean {
  return filters.source === "uke" && !registerOnScreen.isRegisterOnScreen && !registerOnScreen.isSettled;
}

function usesRegisterData(filters: MapFilters): boolean {
  return filters.source === "uke" || filters.showRadiolines || filters.showPlannedMeasurements;
}

function withoutRegisterData(filters: MapFilters): MapFilters {
  const databaseFilters = filters.source === "uke" ? changeMapFilterSource(filters, "internal") : filters;
  return { ...databaseFilters, showRadiolines: false, showPlannedMeasurements: false };
}

export function getEffectiveMapFilters(filters: MapFilters, mapCountries: Pick<MapCountries, "isRegisterOnScreen">): MapFilters {
  if (mapCountries.isRegisterOnScreen || !usesRegisterData(filters)) return filters;

  const knownFilters = filtersWithoutRegisterData.get(filters);
  if (knownFilters !== undefined) return knownFilters;

  const shownFilters = withoutRegisterData(filters);
  filtersWithoutRegisterData.set(filters, shownFilters);
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

export function useRegisterOnScreen(bounds: string): RegisterOnScreen {
  const sources = useBoxCountrySources(bounds);
  const box = parseV1Bounds(bounds);

  return {
    isRegisterOnScreen: isRegisterCountryOnScreen(box, sources.regions, sources.countries),
    isSettled: isClearOfRegisterCountry(box, sources.countries) || isRegisterOnScreenSettled(sources),
  };
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
