import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { type EditorArea, useEditorArea } from "./editorArea";
import { getRememberedListCountries, rememberListCountries, useRememberedListCountries } from "./listCountryMemory";
import { type ListUrlSearch, getUrlSearchKey, hasSameMembers } from "./listUrlValues";
import { type MapLookups, useMapLookups } from "@/features/map/data/mapLookups";

export type ListEntryContext = {
  lookups: MapLookups | undefined;
  area: EditorArea | undefined;
  rememberedCountryCodes: readonly string[];
};

export type ListEntry<Search, Filters> =
  | { isSettled: false }
  | { isSettled: true; search: Search; filters: Filters; isReplacement: boolean; countryOptions: readonly string[] };

export type ListReadiness = {
  isReady: boolean;
  hasFailed: boolean;
  isRetrying: boolean;
  retry: () => void;
};

export type ListStateRules<Search, Filters> = {
  isAdminList: boolean;
  resolveEntry: (search: Search, context: ListEntryContext) => ListEntry<Search, Filters>;
  readFilters: (search: Search) => Filters;
  toSearch: (filters: Filters) => Search;
  moveToFirstPage: (current: Filters, next: Filters) => Filters;
};

type ListState<Filters> = {
  filters: Filters;
  readiness: ListReadiness;
  updateFilters: (update: (current: Filters) => Filters) => void;
};

type ListStateSearch = ListUrlSearch & { countries?: string };
type ListStateFilters = { countryCodes: string[] };

type UseListStateArgs<Search, Filters> = {
  search: Search;
  rules: ListStateRules<Search, Filters>;
  onSearchChange: (search: Search) => void;
};

type LatestListState<Search, Filters> = {
  filters: Filters;
  shownSearchKey: string;
  rememberedSearchKey: string | null;
  onSearchChange: (search: Search) => void;
};

export const UNSETTLED_LIST_ENTRY = { isSettled: false } as const;

export function useListState<Search extends ListStateSearch, Filters extends ListStateFilters>({
  search,
  rules,
  onSearchChange,
}: UseListStateArgs<Search, Filters>): ListState<Filters> {
  const { lookups, isError: hasLookupsError, isRetrying: isRetryingLookups, retry: retryLookups } = useMapLookups();
  const editorArea = useEditorArea(rules.isAdminList);
  const rememberedCountryCodes = useRememberedListCountries();
  const { area } = editorArea;
  const entry = useMemo(
    () => rules.resolveEntry(search, { lookups, area, rememberedCountryCodes }),
    [rules, search, lookups, area, rememberedCountryCodes],
  );
  const filters = useMemo(() => (entry.isSettled ? entry.filters : rules.readFilters(search)), [entry, rules, search]);
  const urlSearchKey = getUrlSearchKey(search);
  const shownSearchKey = entry.isSettled ? getUrlSearchKey(entry.search) : urlSearchKey;
  const latest = useRef<LatestListState<Search, Filters>>({ filters, shownSearchKey, rememberedSearchKey: null, onSearchChange });

  useLayoutEffect(() => {
    const current = latest.current;
    current.onSearchChange = onSearchChange;
    if (current.shownSearchKey === shownSearchKey) return;

    current.filters = filters;
    current.shownSearchKey = shownSearchKey;
  });

  useEffect(() => {
    if (entry.isSettled && entry.isReplacement) latest.current.onSearchChange(entry.search);
  }, [entry]);

  useEffect(() => {
    const current = latest.current;
    if (current.rememberedSearchKey === urlSearchKey || !entry.isSettled || entry.isReplacement) return;

    current.rememberedSearchKey = urlSearchKey;
    if (search.countries === undefined) return;

    const applicableCodes = getRememberedListCountries().filter((countryCode) => entry.countryOptions.includes(countryCode));
    if (!hasSameMembers(applicableCodes, entry.filters.countryCodes)) rememberListCountries(entry.filters.countryCodes);
  }, [entry, search.countries, urlSearchKey]);

  const updateFilters = useCallback(
    (update: (current: Filters) => Filters) => {
      const current = latest.current;
      const nextSearch = rules.toSearch(rules.moveToFirstPage(current.filters, update(current.filters)));
      const nextFilters = rules.readFilters(nextSearch);
      const isLastCountryUnpicked = current.filters.countryCodes.length > 0 && nextFilters.countryCodes.length === 0;

      if (isLastCountryUnpicked) rememberListCountries(nextFilters.countryCodes);
      current.filters = nextFilters;
      current.onSearchChange(nextSearch);
    },
    [rules],
  );

  function retry() {
    if (hasLookupsError) retryLookups();
    if (editorArea.isError) editorArea.retry();
  }

  const isWaitingForLookups = !entry.isSettled && lookups === undefined;
  const isWaitingForArea = !entry.isSettled && area === undefined;
  const readiness: ListReadiness = {
    isReady: entry.isSettled,
    hasFailed: (isWaitingForLookups && hasLookupsError) || (isWaitingForArea && editorArea.isError),
    isRetrying: (isWaitingForLookups && isRetryingLookups) || (isWaitingForArea && editorArea.isRetrying),
    retry,
  };

  return { filters, readiness, updateFilters };
}
