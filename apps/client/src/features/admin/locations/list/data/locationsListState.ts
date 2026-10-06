import { useCallback } from "react";

import { type LocationsListFilters, type LocationsListFiltersChange, moveLocationsListToFirstPage } from "./locationsListFilters";
import { type LocationsListSearch, readLocationsListFilters, toLocationsListSearch } from "./locationsListSearch";
import { fitListFiltersToScope } from "@/features/stations/list/data/listScope";
import { getUrlSearchKey } from "@/features/stations/list/data/listUrlValues";
import {
  type ListEntry,
  type ListEntryContext,
  type ListReadiness,
  type ListStateRules,
  UNSETTLED_LIST_ENTRY,
  useListState,
} from "@/features/stations/list/data/useListState";

type LocationsListEntry = ListEntry<LocationsListSearch, LocationsListFilters>;

type LocationsListState = {
  filters: LocationsListFilters;
  readiness: ListReadiness;
  changeFilters: (change: LocationsListFiltersChange) => void;
};

type UseLocationsListStateArgs = {
  search: LocationsListSearch;
  onSearchChange: (search: LocationsListSearch) => void;
};

const NO_COUNTRY_OPTIONS: readonly string[] = [];

function needsLookups(search: LocationsListSearch, rememberedCountryCodes: readonly string[]): boolean {
  if (search.countries === undefined && rememberedCountryCodes.length > 0) return true;
  return [search.countries, search.operators, search.regions].some((value) => value !== undefined);
}

function settleLocationsListEntry(search: LocationsListSearch, filters: LocationsListFilters, countryOptions: readonly string[]): LocationsListEntry {
  const settledSearch = toLocationsListSearch(filters);
  const isReplacement = getUrlSearchKey(search) !== getUrlSearchKey(settledSearch);

  return { isSettled: true, search: settledSearch, filters, isReplacement, countryOptions };
}

function resolveLocationsListEntry(search: LocationsListSearch, context: ListEntryContext): LocationsListEntry {
  const { lookups, area, rememberedCountryCodes } = context;
  if (area === undefined) return UNSETTLED_LIST_ENTRY;
  if (lookups === undefined && needsLookups(search, rememberedCountryCodes)) return UNSETTLED_LIST_ENTRY;

  const requestedFilters = readLocationsListFilters(search);
  if (lookups === undefined) return settleLocationsListEntry(search, requestedFilters, NO_COUNTRY_OPTIONS);

  const requestedCountryCodes = search.countries === undefined ? rememberedCountryCodes : requestedFilters.countryCodes;
  const fitted = fitListFiltersToScope(requestedFilters, requestedCountryCodes, lookups, area);
  return settleLocationsListEntry(search, fitted.filters, fitted.countryOptions);
}

const LOCATIONS_LIST_RULES: ListStateRules<LocationsListSearch, LocationsListFilters> = {
  isAdminList: true,
  resolveEntry: resolveLocationsListEntry,
  readFilters: readLocationsListFilters,
  toSearch: toLocationsListSearch,
  moveToFirstPage: moveLocationsListToFirstPage,
};

export function useLocationsListState({ search, onSearchChange }: UseLocationsListStateArgs): LocationsListState {
  const { filters, readiness, updateFilters } = useListState({ search, rules: LOCATIONS_LIST_RULES, onSearchChange });

  const changeFilters = useCallback(
    (change: LocationsListFiltersChange) => updateFilters((current) => (typeof change === "function" ? change(current) : change)),
    [updateFilters],
  );

  return { filters, readiness, changeFilters };
}
