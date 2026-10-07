import type { Region } from "@openbts/shared/contract";

import { type EditorArea, canEditPlace, isCountryInEditorArea } from "./editorArea";
import { UNKNOWN_BAND_LABEL } from "@/features/map/data/mapFilters";
import type { MapBandLabelsByCountry, MapLookups } from "@/features/map/data/mapLookups";

type ListScopeFilters = {
  countryCodes: string[];
  operatorIds: number[];
  regionIds: number[];
};

export type ListScope = {
  lookups: MapLookups | undefined;
  area: EditorArea | undefined;
};

type ScopedRegion = Pick<Region, "id" | "countryCode">;

type FittedListFilters<Filters> = {
  filters: Filters;
  countryOptions: string[];
};

const MOST_COUNTRIES_WITHOUT_CHOICE = 1;

export function listCountryOptionCodes(lookups: MapLookups, area: EditorArea): string[] {
  const visibleCodes = lookups.countries.map((country) => country.code);
  return [...new Set(visibleCodes)].filter((countryCode) => isCountryInEditorArea(area, countryCode)).sort();
}

export function fitCountryCodes(countryCodes: readonly string[], countryOptions: readonly string[]): string[] {
  if (countryOptions.length <= MOST_COUNTRIES_WITHOUT_CHOICE) return [];
  return countryOptions.filter((countryCode) => countryCodes.includes(countryCode));
}

export function listCountryCodesInPlay(countryCodes: readonly string[], countryOptions: readonly string[]): readonly string[] {
  return countryCodes.length > 0 ? countryCodes : countryOptions;
}

export function isRegionInScope(region: ScopedRegion, countryCodesInPlay: readonly string[], area: EditorArea): boolean {
  return countryCodesInPlay.includes(region.countryCode) && canEditPlace(area, { countryCode: region.countryCode, regionId: region.id });
}

function keepOperatorIdsInPlay(operatorIds: readonly number[], lookups: MapLookups, countryCodesInPlay: readonly string[]): number[] {
  return operatorIds.filter((operatorId) => {
    const operator = lookups.operatorsById.get(operatorId)?.operator;
    return operator !== undefined && countryCodesInPlay.includes(operator.countryCode);
  });
}

function keepRegionIdsInPlay(regionIds: readonly number[], lookups: MapLookups, countryCodesInPlay: readonly string[], area: EditorArea): number[] {
  return regionIds.filter((regionId) => {
    const region = lookups.regionsById.get(regionId);
    return region !== undefined && isRegionInScope(region, countryCodesInPlay, area);
  });
}

export function keepKnownBandLabels(bands: readonly number[], lookups: MapLookups): number[] {
  const knownLabels = new Set(lookups.bands.map((band) => band.labelMhz));
  return bands.filter((label) => label === UNKNOWN_BAND_LABEL || knownLabels.has(label));
}

export function keepBandLabelsInPlans(
  bands: readonly number[],
  countryCodesInPlay: readonly string[],
  labelsByCountry: MapBandLabelsByCountry,
): number[] {
  if (!countryCodesInPlay.every((countryCode) => labelsByCountry.has(countryCode))) return [...bands];

  return bands.filter(
    (label) => label === UNKNOWN_BAND_LABEL || countryCodesInPlay.some((countryCode) => labelsByCountry.get(countryCode)?.includes(label) === true),
  );
}

export function fitListFiltersToScope<Filters extends ListScopeFilters>(
  filters: Filters,
  requestedCountryCodes: readonly string[],
  lookups: MapLookups,
  area: EditorArea,
): FittedListFilters<Filters> {
  const countryOptions = listCountryOptionCodes(lookups, area);
  const countryCodes = fitCountryCodes(requestedCountryCodes, countryOptions);
  const countryCodesInPlay = listCountryCodesInPlay(countryCodes, countryOptions);

  return {
    countryOptions,
    filters: {
      ...filters,
      countryCodes,
      operatorIds: keepOperatorIdsInPlay(filters.operatorIds, lookups, countryCodesInPlay),
      regionIds: keepRegionIdsInPlay(filters.regionIds, lookups, countryCodesInPlay, area),
    },
  };
}

export function narrowListToCountries<Filters extends ListScopeFilters>(
  filters: Filters,
  countryCodes: readonly string[],
  scope: ListScope,
): Filters {
  if (scope.lookups === undefined || scope.area === undefined) return filters;
  return fitListFiltersToScope(filters, countryCodes, scope.lookups, scope.area).filters;
}
