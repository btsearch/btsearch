import type { GeocodedPlace, GeocodingKind, GeocodingSource } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import { BackendUnavailableError, fetchV2Data } from "@/lib/api";

export type { GeocodedPlace, GeocodingKind, GeocodingSource };

export type PlaceSearchScope = {
  countryCodes: readonly string[];
  language: string;
};

export type PlacePoint = {
  latitude: number;
  longitude: number;
};

const PLACE_SEARCH_MIN_LENGTH = 3;
const PLACE_SEARCH_MAX_LENGTH = 200;
const COUNTRY_CODES_LIMIT = 100;
const COORDINATE_DECIMALS = 6;
const GEOCODING_STALE_TIME = 1000 * 60 * 60;
const LANGUAGE_CODE_LENGTH = 2;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2}$/;
const SERVER_DEFAULT_LANGUAGE = "en";

export class GeocodingUnavailableError extends Error {
  constructor() {
    super("Geocoding is temporarily unavailable.");
  }
}

function throwGeocodingError(error: unknown): never {
  if (error instanceof BackendUnavailableError) throw new GeocodingUnavailableError();
  throw error;
}

function toLanguageCode(language: string): string {
  const code = language.slice(0, LANGUAGE_CODE_LENGTH).toLowerCase();
  return LANGUAGE_CODE_PATTERN.test(code) ? code : SERVER_DEFAULT_LANGUAGE;
}

function toCountryCodeList(countryCodes: readonly string[]): string {
  const codes = [...new Set(countryCodes)].sort();
  return codes.length > COUNTRY_CODES_LIMIT ? "" : codes.join(",");
}

function toPlaceSearchText(query: string): string {
  return query.trim().slice(0, PLACE_SEARCH_MAX_LENGTH).trimEnd();
}

function toDegrees(value: number): string {
  return value.toFixed(COORDINATE_DECIMALS);
}

function fetchGeocodedPlaces(text: string, countryCodeList: string, languageCode: string, signal?: AbortSignal): Promise<GeocodedPlace[]> {
  const params = new URLSearchParams({ q: text, language: languageCode });
  if (countryCodeList !== "") params.set("countryCodes", countryCodeList);
  return fetchV2Data<GeocodedPlace[]>(`geocoding/search?${params.toString()}`, { signal }).catch(throwGeocodingError);
}

function fetchGeocodedPlaceAt(latitude: string, longitude: string, languageCode: string, signal?: AbortSignal): Promise<GeocodedPlace | null> {
  const params = new URLSearchParams({ latitude, longitude, language: languageCode });
  return fetchV2Data<GeocodedPlace | null>(`geocoding/reverse?${params.toString()}`, { signal }).catch(throwGeocodingError);
}

export function placeSearchQueryOptions(query: string, scope: PlaceSearchScope) {
  const text = toPlaceSearchText(query);
  const countryCodeList = toCountryCodeList(scope.countryCodes);
  const languageCode = toLanguageCode(scope.language);

  return queryOptions({
    queryKey: ["geocoding-search", text, countryCodeList, languageCode, "v2"] as const,
    queryFn: text.length < PLACE_SEARCH_MIN_LENGTH ? skipToken : ({ signal }) => fetchGeocodedPlaces(text, countryCodeList, languageCode, signal),
    staleTime: GEOCODING_STALE_TIME,
  });
}

export function placeAtQueryOptions(point: PlacePoint | null, language: string) {
  const latitude = point === null ? null : toDegrees(point.latitude);
  const longitude = point === null ? null : toDegrees(point.longitude);
  const languageCode = toLanguageCode(language);

  return queryOptions({
    queryKey: ["reverse-geocode", latitude, longitude, languageCode, "v2"] as const,
    queryFn: latitude === null || longitude === null ? skipToken : ({ signal }) => fetchGeocodedPlaceAt(latitude, longitude, languageCode, signal),
    staleTime: GEOCODING_STALE_TIME,
  });
}
