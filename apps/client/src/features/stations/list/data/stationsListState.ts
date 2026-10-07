import { useCallback } from "react";

import { fitListFiltersToScope, keepKnownBandLabels } from "./listScope";
import { getUrlSearchKey } from "./listUrlValues";
import {
  type StationsListFilters,
  type StationsListFiltersChange,
  type StationsListVariant,
  moveStationsListToFirstPage,
} from "./stationsListFilters";
import { type StationsListSearch, readStationsListFilters, toStationsListSearch } from "./stationsListSearch";
import { type ListEntry, type ListEntryContext, type ListReadiness, type ListStateRules, UNSETTLED_LIST_ENTRY, useListState } from "./useListState";

type StationsListEntry = ListEntry<StationsListSearch, StationsListFilters>;

type StationsListState = {
  filters: StationsListFilters;
  readiness: ListReadiness;
  changeFilters: (change: StationsListFiltersChange) => void;
};

type UseStationsListStateArgs = {
  search: StationsListSearch;
  variant: StationsListVariant;
  onSearchChange: (search: StationsListSearch) => void;
};

const NO_COUNTRY_OPTIONS: readonly string[] = [];

function needsLookups(search: StationsListSearch, rememberedCountryCodes: readonly string[]): boolean {
  if (search.countries === undefined && rememberedCountryCodes.length > 0) return true;
  return [search.countries, search.operators, search.regions, search.bands].some((value) => value !== undefined);
}

function settleStationsListEntry(
  search: StationsListSearch,
  filters: StationsListFilters,
  countryOptions: readonly string[],
  variant: StationsListVariant,
): StationsListEntry {
  const settledSearch = toStationsListSearch(filters, variant);
  const isReplacement = getUrlSearchKey(search) !== getUrlSearchKey(settledSearch);

  return { isSettled: true, search: settledSearch, filters, isReplacement, countryOptions };
}

function resolveStationsListEntry(search: StationsListSearch, variant: StationsListVariant, context: ListEntryContext): StationsListEntry {
  const { lookups, area, rememberedCountryCodes } = context;
  if (area === undefined) return UNSETTLED_LIST_ENTRY;
  if (lookups === undefined && needsLookups(search, rememberedCountryCodes)) return UNSETTLED_LIST_ENTRY;

  const requestedFilters = readStationsListFilters(search, variant);
  if (lookups === undefined) return settleStationsListEntry(search, requestedFilters, NO_COUNTRY_OPTIONS, variant);

  const requestedCountryCodes = search.countries === undefined ? rememberedCountryCodes : requestedFilters.countryCodes;
  const fitted = fitListFiltersToScope(requestedFilters, requestedCountryCodes, lookups, area);
  const filters = { ...fitted.filters, bands: keepKnownBandLabels(fitted.filters.bands, lookups) };
  return settleStationsListEntry(search, filters, fitted.countryOptions, variant);
}

function createStationsListRules(variant: StationsListVariant): ListStateRules<StationsListSearch, StationsListFilters> {
  return {
    isAdminList: variant === "admin",
    resolveEntry: (search, context) => resolveStationsListEntry(search, variant, context),
    readFilters: (search) => readStationsListFilters(search, variant),
    toSearch: (filters) => toStationsListSearch(filters, variant),
    moveToFirstPage: moveStationsListToFirstPage,
  };
}

const STATIONS_LIST_RULES: Record<StationsListVariant, ListStateRules<StationsListSearch, StationsListFilters>> = {
  public: createStationsListRules("public"),
  admin: createStationsListRules("admin"),
};

export function useStationsListState({ search, variant, onSearchChange }: UseStationsListStateArgs): StationsListState {
  const { filters, readiness, updateFilters } = useListState({ search, rules: STATIONS_LIST_RULES[variant], onSearchChange });

  const changeFilters = useCallback(
    (change: StationsListFiltersChange) => updateFilters((current) => (typeof change === "function" ? change(current) : change)),
    [updateFilters],
  );

  return { filters, readiness, changeFilters };
}
