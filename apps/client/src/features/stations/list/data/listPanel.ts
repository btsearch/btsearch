import type { Region } from "@openbts/shared/contract";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type EditorArea, useEditorArea } from "./editorArea";
import { fitCountryCodes, isRegionInScope, listCountryOptionCodes } from "./listScope";
import { MOST_ALWAYS_OPEN_OPERATOR_ROWS } from "@/features/map/components/search-overlay/mapFilterPanelRules";
import { type MapCountries, sortCountryCodesByName } from "@/features/map/data/mapCountries";
import type { MapFilters } from "@/features/map/data/mapFilters";
import { type MapLookups, useMapLookups } from "@/features/map/data/mapLookups";

export type ListCountries = {
  options: readonly string[];
  picked: readonly string[];
  inPlay: readonly string[];
  hasCountrySection: boolean;
  hasCountryTiles: boolean;
  hasOperatorRows: boolean;
  mapCountries: MapCountries;
};

export type ListRegionGroup = {
  countryCode: string;
  regions: Region[];
};

export type ListPanelScope = {
  lookups: MapLookups | undefined;
  hasLookupsError: boolean;
  isRetryingLookups: boolean;
  retryLookups: () => void;
  area: EditorArea | undefined;
  countries: ListCountries;
  regionGroups: ListRegionGroup[];
};

export type ListPanel<Filters> = Omit<ListPanelScope, "area"> & {
  mapFilters: MapFilters;
  activeFilterCount: number;
  pickCountries: (filters: Filters, countryCodes: readonly string[]) => Filters;
};

const NO_LIST_COUNTRIES: ListCountries = {
  options: [],
  picked: [],
  inPlay: [],
  hasCountrySection: false,
  hasCountryTiles: false,
  hasOperatorRows: true,
  mapCountries: { onScreen: [], first: null, isRegisterOnScreen: false },
};

function getListCountries(
  countryCodes: readonly string[],
  lookups: MapLookups | undefined,
  area: EditorArea | undefined,
  language: string,
): ListCountries {
  if (lookups === undefined || area === undefined) return NO_LIST_COUNTRIES;

  const optionCodes = listCountryOptionCodes(lookups, area);
  const pickedCodes = fitCountryCodes(countryCodes, optionCodes);
  const options = sortCountryCodesByName(optionCodes, language);
  const picked = options.filter((countryCode) => pickedCodes.includes(countryCode));
  const inPlay = picked.length > 0 ? picked : options;

  return {
    options,
    picked,
    inPlay,
    hasCountrySection: options.length > 1,
    hasCountryTiles: inPlay.length > 1,
    hasOperatorRows: picked.length > 0 || options.length <= MOST_ALWAYS_OPEN_OPERATOR_ROWS,
    mapCountries: { onScreen: inPlay, first: inPlay.at(0) ?? null, isRegisterOnScreen: false },
  };
}

function listRegionGroups(
  countryCodesInPlay: readonly string[],
  lookups: MapLookups | undefined,
  area: EditorArea | undefined,
  language: string,
): ListRegionGroup[] {
  if (lookups === undefined || area === undefined) return [];

  return countryCodesInPlay.flatMap((countryCode) => {
    const regions = lookups.regions
      .filter((region) => region.countryCode === countryCode && isRegionInScope(region, countryCodesInPlay, area))
      .sort((left, right) => left.name.localeCompare(right.name, language));
    return regions.length === 0 ? [] : [{ countryCode, regions }];
  });
}

export function useListCountries(countryCodes: readonly string[], isAdminList: boolean): ListCountries {
  const { i18n } = useTranslation();
  const { lookups } = useMapLookups();
  const { area } = useEditorArea(isAdminList);
  const { language } = i18n;

  return useMemo(() => getListCountries(countryCodes, lookups, area, language), [countryCodes, lookups, area, language]);
}

export function useListPanelScope(countryCodes: readonly string[], isAdminList: boolean): ListPanelScope {
  const { i18n } = useTranslation();
  const { lookups, isError: hasLookupsError, isRetrying: isRetryingLookups, retry: retryLookups } = useMapLookups();
  const { area } = useEditorArea(isAdminList);
  const { language } = i18n;
  const countries = useMemo(() => getListCountries(countryCodes, lookups, area, language), [countryCodes, lookups, area, language]);
  const countryCodesInPlay = countries.inPlay;
  const regionGroups = useMemo(() => listRegionGroups(countryCodesInPlay, lookups, area, language), [countryCodesInPlay, lookups, area, language]);

  return { lookups, hasLookupsError, isRetryingLookups, retryLookups, area, countries, regionGroups };
}
