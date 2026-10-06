import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode, memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FILTER_KEYWORDS } from "../../constants";
import type { MapCountries } from "../../data/mapCountries";
import { type MapFilters, type MapFiltersChange, changeMapFilterSource, countActiveMapFilters } from "../../data/mapFilters";
import { getMapMaxBounds, listKeybindOperatorIds, useMapLookups } from "../../data/mapLookups";
import { getMapFilterKeybindUpdater, getMapVisibilityKeybind } from "../../filterKeybinds";
import { parseFilters } from "../../filters";
import { useMapKeybinds } from "../../hooks/useMapKeybinds";
import { useSearchState } from "../../hooks/useSearchState";
import {
  type StationSearchHit,
  type UkeSearchPermitStation,
  type UkeSearchRadioline,
  isRejectedSearchQuery,
  parseGpsCoordinates,
  searchUkePermits,
  stationSearchQueryOptions,
} from "../../searchApi";
import { MapCursorInfo } from "../mapCursorInfo";
import { AutocompleteDropdown } from "./autocompleteDropdown";
import { FilterButton } from "./filterButton";
import { useCalmTransition } from "./mapFilterMotion";
import { FilterPanel } from "./mapFilterPanel";
import { findKeybindCountryCode } from "./mapFilterPanelRules";
import { MapStyleSwitcher } from "./mapStyleSwitcher";
import { MobileStatsPanel } from "./mobileStatsPanel";
import { SearchInput } from "./searchInput";
import { type SearchOption, buildAutocompleteOptions, buildSearchResultOptions } from "./searchOptions";
import { type SearchFailureSource, SearchResults, type SearchSurfaceState } from "./searchResultsContent";
import { StationCounter } from "./stationCounter";
import { useSearchNavigation } from "./useSearchNavigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";
import { usePreferences } from "@/hooks/usePreferences";
import { placeAtQueryOptions, placeSearchQueryOptions } from "@/lib/geo/geocoding";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

const MAP_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((kw) => kw.availableOn.includes("map"));
const MAP_SEARCH_MODE_STORAGE_KEY = "map:search:affectMap";
const UKE_SEARCH_STALE_TIME = 1000 * 60 * 5;
const EMPTY_RESULTS: never[] = [];
const DROPDOWN_SHOWN = { opacity: 1, y: 0 } as const;
const DROPDOWN_HIDDEN = { opacity: 0, y: -8 } as const;
const DROPDOWN_OPEN_CLASS = "max-md:absolute max-md:inset-x-0 max-md:top-full max-md:z-10";
const DROPDOWN_CLOSING_CLASS = "absolute inset-x-0 top-full z-10 group-data-[compact]/search:hidden";
type MapSearchMode = "results" | "map";

function loadMapSearchMode(): MapSearchMode {
  try {
    return localStorage.getItem(MAP_SEARCH_MODE_STORAGE_KEY) === "true" ? "map" : "results";
  } catch {
    return "results";
  }
}

function saveMapSearchMode(mode: MapSearchMode): void {
  try {
    localStorage.setItem(MAP_SEARCH_MODE_STORAGE_KEY, String(mode === "map"));
  } catch {}
}

type MapSearchOverlayProps = {
  locationCount: number;
  totalCount: number;
  radioLineCount?: number;
  radioLineTotalCount?: number;
  isRadioLinesFetching?: boolean;
  filters: MapFilters;
  mapCountries: MapCountries;
  zoom?: number;
  activeMarker?: { latitude: number; longitude: number } | null;
  onActiveMarkerClear?: () => void;
  onFiltersChange: (update: MapFiltersChange) => void;
  onLocationSelect?: (lat: number, lon: number) => void;
  onStationSelect?: (station: StationSearchHit) => void;
  onUkeStationSelect?: (station: UkeSearchPermitStation) => void;
  onRadiolineSelect?: (radioline: UkeSearchRadioline) => void;
  onToggleHeatmap?: () => void;
  onTogglePlannedMeasurements?: () => void;
  onFilterQueryChange?: (q: string | undefined) => void;
  rejectedSearchText?: string;
  mapContext?: ReactElement;
};

function SearchDropdownFrame({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent();
  const transition = useCalmTransition();

  return (
    <motion.div
      inert={!isPresent}
      initial={false}
      animate={DROPDOWN_SHOWN}
      exit={DROPDOWN_HIDDEN}
      transition={transition}
      className={isPresent ? DROPDOWN_OPEN_CLASS : DROPDOWN_CLOSING_CLASS}
    >
      {children}
    </motion.div>
  );
}

export const MapSearchOverlay = memo(function MapSearchOverlay({
  locationCount,
  totalCount,
  radioLineCount = 0,
  radioLineTotalCount = 0,
  isRadioLinesFetching = false,
  filters,
  mapCountries,
  zoom,
  activeMarker,
  onActiveMarkerClear,
  onFiltersChange,
  onLocationSelect,
  onStationSelect,
  onUkeStationSelect,
  onRadiolineSelect,
  onToggleHeatmap,
  onTogglePlannedMeasurements,
  onFilterQueryChange,
  rejectedSearchText,
  mapContext,
}: MapSearchOverlayProps) {
  const { i18n } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const filterPanelRef = useRef<HTMLFieldSetElement>(null);
  const filterPanelId = useId();
  const isMobile = useIsMobile();

  const { preferences, updatePreferences } = usePreferences();
  const { lookups } = useMapLookups();
  const isUkeSource = filters.source === "uke";
  const { isRegisterOnScreen } = mapCountries;
  const supportsMapMode = onFilterQueryChange !== undefined;
  const [storedSearchMode, setStoredSearchMode] = useState<MapSearchMode>(loadMapSearchMode);
  const searchMode = supportsMapMode && !isUkeSource ? storedSearchMode : "results";

  const {
    query,
    inputValue,
    debouncedQuery,
    debouncedInput: searchKeyword,
    isFocused,
    statsSearchMode,
    parsedFilters,
    autocompleteOptions,
    activeOverlay,
    containerRef,
    inputRef,
    focusedChipIndex,
    handleContainerBlur,
    handleInputChange,
    handleInputFocus,
    handleInputClick,
    openOverlay,
    handleKeyDown: handleChipKeyDown,
    applyAutocomplete,
    clearSearch,
    removeFilter,
    closeOverlay,
  } = useSearchState({
    filterKeywords: isUkeSource ? EMPTY_RESULTS : MAP_FILTER_KEYWORDS,
    parseFilters,
    resultsEnabled: searchMode === "results",
  });

  function handleSearchModeChange(mode: MapSearchMode) {
    if (mode === "map" && (!supportsMapMode || isUkeSource)) return;
    setStoredSearchMode(mode);
    saveMapSearchMode(mode);
    if (mode === "map") {
      closeOverlay();
      return;
    }
    onFilterQueryChange?.(undefined);
    if (isFocused) openOverlay(true);
  }

  function handleFiltersChange(update: MapFiltersChange) {
    const nextFilters = typeof update === "function" ? update(filters) : update;
    if (supportsMapMode && nextFilters.source === "uke" && storedSearchMode === "map") onFilterQueryChange?.(undefined);
    if (nextFilters.source === "uke" && isFocused && query.trim() !== "") openOverlay(true, false);
    onFiltersChange(update);
  }

  const showMobileMapContext = isMobile && mapContext !== undefined && !mobileExpanded && !isFocused;

  const maxBounds = useMemo(() => (lookups === undefined ? undefined : getMapMaxBounds(lookups.countries)), [lookups]);
  const gpsCoords = useMemo(() => parseGpsCoordinates(debouncedQuery, maxBounds), [debouncedQuery, maxBounds]);
  const gpsPoint = gpsCoords === null ? null : { latitude: gpsCoords.lat, longitude: gpsCoords.lng };
  const resultsQueryEnabled = searchMode === "results" && activeOverlay === "results" && debouncedQuery.trim().length > 0;
  const canSearchInternalStations = onStationSelect !== undefined;
  const canSearchUke = onUkeStationSelect !== undefined || onRadiolineSelect !== undefined;
  const shouldSearchStations = resultsQueryEnabled && !isUkeSource && canSearchInternalStations;
  const shouldSearchUke = resultsQueryEnabled && isUkeSource && canSearchUke;

  const gpsPlaceQuery = useQuery({
    ...placeAtQueryOptions(gpsPoint, i18n.language),
    enabled: resultsQueryEnabled && onLocationSelect !== undefined && gpsPoint !== null,
  });

  const gpsPlace = gpsPlaceQuery.data ?? null;
  const gpsResult = useMemo(() => {
    if (gpsCoords === null) return null;
    const address = gpsPlace === null ? null : [gpsPlace.name, gpsPlace.description].filter(Boolean).join(", ");
    return { lat: gpsCoords.lat, lng: gpsCoords.lng, address };
  }, [gpsCoords, gpsPlace]);
  const gpsSource = gpsPlace?.source ?? null;

  const shouldSearchLocations = resultsQueryEnabled && onLocationSelect !== undefined && searchKeyword.trim().length >= 3;

  const locationQuery = useQuery({
    ...placeSearchQueryOptions(searchKeyword, { countryCodes: mapCountries.onScreen, language: i18n.language }),
    enabled: shouldSearchLocations,
    placeholderData: keepPreviousData,
  });

  const stationQuery = useQuery({
    ...stationSearchQueryOptions(debouncedQuery),
    enabled: shouldSearchStations,
    placeholderData: keepPreviousData,
  });

  const ukeQuery = useQuery({
    queryKey: ["uke-search", debouncedQuery, filters.source],
    queryFn: () => searchUkePermits(debouncedQuery),
    enabled: shouldSearchUke,
    staleTime: UKE_SEARCH_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  const locationResults = shouldSearchLocations ? (locationQuery.data ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const locationSource = locationResults.at(0)?.source ?? null;
  const stationResults = isUkeSource ? EMPTY_RESULTS : (stationQuery.data?.hits ?? EMPTY_RESULTS);
  const permitResults = isUkeSource ? (ukeQuery.data?.stations ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const radiolineResults = isUkeSource ? (ukeQuery.data?.radiolines ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const builtSearchResults = useMemo(
    () =>
      buildSearchResultOptions({
        gpsResult,
        gpsSource,
        locationResults,
        locationSource,
        stationResults,
        permitResults,
        radiolineResults,
        capabilities: {
          location: onLocationSelect !== undefined,
          station: onStationSelect !== undefined,
          permit: onUkeStationSelect !== undefined,
          radioline: onRadiolineSelect !== undefined,
        },
      }),
    [
      gpsResult,
      gpsSource,
      locationResults,
      locationSource,
      onLocationSelect,
      onRadiolineSelect,
      onStationSelect,
      onUkeStationSelect,
      permitResults,
      radiolineResults,
      stationResults,
    ],
  );
  const searchResultOptions = builtSearchResults.options;
  const showsStationGroup = builtSearchResults.groups.some((group) => group.kind === "station");
  const stationTotalCount = showsStationGroup ? (stationQuery.data?.total ?? 0) : 0;
  const autocompleteSearchOptions = useMemo(() => buildAutocompleteOptions(autocompleteOptions), [autocompleteOptions]);
  const showAutocomplete = !isUkeSource && activeOverlay === "autocomplete" && autocompleteOptions.length > 0;
  const showResults = searchMode === "results" && activeOverlay === "results";
  let candidateNavigationOptions: SearchOption[] = EMPTY_RESULTS;
  if (!isUkeSource && autocompleteOptions.length > 0) candidateNavigationOptions = autocompleteSearchOptions;
  else if (searchMode === "results") candidateNavigationOptions = searchResultOptions;

  let navigationOptions = candidateNavigationOptions;
  if (showAutocomplete) navigationOptions = autocompleteSearchOptions;
  else if (showResults) navigationOptions = searchResultOptions;
  const listboxId = useId();
  const navigation = useSearchNavigation(navigationOptions, listboxId, `${searchMode}:${query}`);
  const hasLocationSearchFailed = shouldSearchLocations && locationQuery.isError;
  const hasStationSearchFailed = shouldSearchStations && stationQuery.isError && !isRejectedSearchQuery(stationQuery.error);
  const hasUkeSearchFailed = shouldSearchUke && ukeQuery.isError;
  const failedSources: SearchFailureSource[] = [];
  if (hasLocationSearchFailed) failedSources.push("locations");
  if (hasStationSearchFailed) failedSources.push("stations");
  if (hasUkeSearchFailed) failedSources.push("uke");

  const querySettled = query === debouncedQuery;
  const participatingQueryIsFetching =
    (shouldSearchLocations && locationQuery.fetchStatus === "fetching") ||
    (shouldSearchStations && stationQuery.fetchStatus === "fetching") ||
    (shouldSearchUke && ukeQuery.fetchStatus === "fetching");
  const hasPlaceholderData =
    (shouldSearchLocations && locationQuery.isPlaceholderData) ||
    (shouldSearchStations && stationQuery.isPlaceholderData) ||
    (shouldSearchUke && ukeQuery.isPlaceholderData);
  const hasSearchResults = searchResultOptions.length > 0;
  let searchSurfaceState: SearchSurfaceState;
  if (hasSearchResults) {
    searchSurfaceState = {
      kind: "ready",
      updating: !querySettled || participatingQueryIsFetching || hasPlaceholderData,
      failedSources,
    };
  } else if (!querySettled || participatingQueryIsFetching) {
    searchSurfaceState = { kind: "loading" };
  } else if (failedSources.length > 0) {
    searchSurfaceState = { kind: "error", failedSources };
  } else {
    searchSurfaceState = { kind: "empty" };
  }
  const isSearchBusy = showResults && (searchSurfaceState.kind === "loading" || (searchSurfaceState.kind === "ready" && searchSurfaceState.updating));
  const hasActiveListbox = showAutocomplete || (showResults && searchSurfaceState.kind === "ready");

  useEffect(() => {
    if (searchMode !== "map") {
      onFilterQueryChange?.(undefined);
      return;
    }
    onFilterQueryChange?.(debouncedQuery || undefined);
  }, [debouncedQuery, onFilterQueryChange, searchMode]);

  function retryFailedSearches() {
    const retries: Promise<unknown>[] = [];
    if (hasLocationSearchFailed) retries.push(locationQuery.refetch());
    if (hasStationSearchFailed) retries.push(stationQuery.refetch());
    if (hasUkeSearchFailed) retries.push(ukeQuery.refetch());
    void Promise.allSettled(retries);
  }

  function selectSearchOption(option: SearchOption | undefined) {
    if (!option) return;
    navigation.reset();

    switch (option.kind) {
      case "filter":
        applyAutocomplete(option.keyword.key);
        return;
      case "gps":
        if (!onLocationSelect) return;
        onLocationSelect(option.result.lat, option.result.lng);
        break;
      case "location":
        if (!onLocationSelect) return;
        onLocationSelect(option.result.latitude, option.result.longitude);
        break;
      case "station":
        if (!onStationSelect) return;
        onStationSelect(option.result);
        break;
      case "permit":
        if (!onUkeStationSelect) return;
        onUkeStationSelect(option.result);
        break;
      case "radioline":
        if (!onRadiolineSelect) return;
        onRadiolineSelect(option.result);
        break;
    }
    closeOverlay();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    handleChipKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (navigationOptions.length === 0) return;
      e.preventDefault();
      if (!activeOverlay) handleInputClick();
      navigation.move(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter" && activeOverlay && navigationOptions.length > 0) {
      e.preventDefault();
      selectSearchOption(navigation.activeOption ?? navigationOptions[0]);
      return;
    }
    if (e.key === "Escape") {
      if (activeOverlay) {
        e.preventDefault();
        navigation.reset();
        closeOverlay();
      } else {
        inputRef.current?.blur();
        setShowFilters(false);
      }
    }
    if (e.key === "Tab") navigation.reset();
  }

  function handleMobileExpand() {
    setMobileExpanded(true);
  }

  function handleMobileCollapse() {
    setMobileExpanded(false);
  }

  function handleSearchBlur(event: FocusEvent<HTMLElement>) {
    handleContainerBlur(event);
    const nextTarget = event.relatedTarget as Node | null;
    if (containerRef.current?.contains(nextTarget)) return;
    navigation.reset();
    handleMobileCollapse();
  }

  function handleToggleFilters() {
    setShowFilters((prev) => !prev);
  }

  useMapKeybinds(({ key, shiftKey }) => {
    if (key === "f" && !shiftKey) {
      (document.activeElement as HTMLElement)?.blur();
      setShowFilters((prev) => !prev);
      return true;
    }

    const visibility = getMapVisibilityKeybind(key, shiftKey);
    if (visibility === "stations") {
      handleFiltersChange((current) => ({ ...current, showStations: !current.showStations }));
      return true;
    }
    if (visibility === "azimuths") {
      updatePreferences((current) => ({ showAzimuths: !current.showAzimuths }));
      return true;
    }

    const updateFilters = getMapFilterKeybindUpdater(key, shiftKey, {
      operatorIds: listKeybindOperatorIds(lookups, findKeybindCountryCode(filters, mapCountries)),
      isRegisterOnScreen,
    });
    if (updateFilters !== undefined) {
      handleFiltersChange(updateFilters);
      return true;
    }

    if (shiftKey) return false;

    switch (key) {
      case "h":
        onToggleHeatmap?.();
        return true;
      case "p":
        if (!isRegisterOnScreen) return false;
        onTogglePlannedMeasurements?.();
        return true;
      default:
        return false;
    }
  });

  useEffect(() => {
    if (!preferences.hideFiltersOnMapClick || !showFilters) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (filterPanelRef.current?.contains(target)) return;
      if ((target as Element)?.closest("[data-filter-toggle]")) return;
      setShowFilters(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [preferences.hideFiltersOnMapClick, showFilters]);

  function handleSourceChange(source: StationSource) {
    handleFiltersChange((current) => changeMapFilterSource(current, source));
  }

  const showFloatingMobileMapControls = isMobile && preferences.navMode === "floating";
  const activeFilterCount = countActiveMapFilters(filters, lookups?.operators);
  const mobileStatsPanel = (
    <MobileStatsPanel
      locationCount={locationCount}
      totalCount={totalCount}
      radioLineCount={radioLineCount}
      radioLineTotalCount={radioLineTotalCount}
      isRadioLinesFetching={isRadioLinesFetching}
      showStations={filters.showStations}
      searchMode={statsSearchMode as "bounds" | "search"}
      zoom={zoom}
      source={filters.source}
      mapCountries={mapCountries}
      onSourceChange={handleSourceChange}
    />
  );
  const filterPanel = (
    <FilterPanel
      isSheet={isMobile}
      filters={filters}
      mapCountries={mapCountries}
      onFiltersChange={handleFiltersChange}
      onSourceChange={handleSourceChange}
      onToggleHeatmap={onToggleHeatmap}
      onTogglePlannedMeasurements={onTogglePlannedMeasurements}
    />
  );
  return (
    <>
      <div
        className={cn(
          "absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-105 z-10",
          (showFilters || showResults || showAutocomplete) && "z-20",
        )}
      >
        <div className="flex items-start gap-2">
          {showMobileMapContext ? <div className="min-w-0 flex-1 overflow-hidden">{mapContext}</div> : null}

          <search
            ref={containerRef}
            onBlurCapture={handleSearchBlur}
            data-compact={showMobileMapContext ? "" : undefined}
            className={cn("group/search relative", showMobileMapContext ? "shrink-0" : "min-w-0 flex-1")}
          >
            <SearchInput
              inputRef={inputRef}
              inputValue={inputValue}
              parsedFilters={parsedFilters}
              focusedChipIndex={focusedChipIndex}
              isBusy={isSearchBusy}
              isQueryRejected={rejectedSearchText === query}
              query={query}
              isFocused={isFocused}
              isMobile={isMobile}
              mobileExpanded={mobileExpanded}
              listboxId={hasActiveListbox ? listboxId : undefined}
              activeOptionId={hasActiveListbox ? navigation.activeOptionId : undefined}
              isExpanded={hasActiveListbox}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onInputFocus={handleInputFocus}
              onInputClick={handleInputClick}
              onRemoveFilter={removeFilter}
              onClearSearch={clearSearch}
              onMobileExpand={handleMobileExpand}
              mode={searchMode}
              showModeControl={supportsMapMode && !isUkeSource}
              onModeChange={handleSearchModeChange}
              filterSlot={
                <>
                  <div className="h-6 w-px bg-border shrink-0" />
                  <FilterButton
                    showFilters={showFilters}
                    activeFilterCount={activeFilterCount}
                    panelId={showFilters && !isMobile ? filterPanelId : undefined}
                    onClick={handleToggleFilters}
                  />
                </>
              }
            />

            <AnimatePresence>
              {showAutocomplete || showResults ? (
                <SearchDropdownFrame key="dropdown">
                  {showAutocomplete ? (
                    <AutocompleteDropdown
                      options={autocompleteOptions}
                      listboxId={listboxId}
                      activeKey={navigation.activeKey}
                      onActiveKeyChange={navigation.setActiveKey}
                      onSelect={applyAutocomplete}
                    />
                  ) : (
                    <SearchResults
                      state={searchSurfaceState}
                      listboxId={listboxId}
                      activeKey={navigation.activeKey}
                      queryText={searchKeyword}
                      isGpsAddressLoading={gpsPlaceQuery.fetchStatus === "fetching"}
                      groups={builtSearchResults.groups}
                      stationTotalCount={stationTotalCount}
                      onActiveKeyChange={navigation.setActiveKey}
                      onRetry={retryFailedSearches}
                      onSelect={selectSearchOption}
                    />
                  )}
                </SearchDropdownFrame>
              ) : null}
            </AnimatePresence>
          </search>
        </div>

        {isMobile ? (
          <div className="mt-2 flex justify-end md:hidden">
            <div className="pointer-events-auto relative shrink-0">
              <MapStyleSwitcher position="search" />
            </div>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {showFilters && !isMobile ? (
            <fieldset key="filter-panel" id={filterPanelId} ref={filterPanelRef} tabIndex={-1}>
              {filterPanel}
            </fieldset>
          ) : null}
        </AnimatePresence>
      </div>

      {isMobile ? (
        <Sheet open={showFilters} onOpenChange={setShowFilters}>
          <SheetContent side="bottom" className="max-h-[85dvh] flex flex-col gap-0 p-0 rounded-t-2xl" showCloseButton={false}>
            {filterPanel}
          </SheetContent>
        </Sheet>
      ) : null}

      <div className="hidden md:flex absolute top-4 left-4 z-10 flex-col items-start gap-1.5 pointer-events-none">
        {!isMobile && mapContext !== undefined ? <div className="pointer-events-auto max-w-xs">{mapContext}</div> : null}

        <div className="pointer-events-auto">
          <StationCounter
            locationCount={locationCount}
            totalCount={totalCount}
            radioLineCount={radioLineCount}
            radioLineTotalCount={radioLineTotalCount}
            isRadioLinesFetching={isRadioLinesFetching}
            showStations={filters.showStations}
            zoom={zoom}
            source={filters.source}
            mapCountries={mapCountries}
            onSourceChange={handleSourceChange}
          />
        </div>

        {!isMobile ? <MapCursorInfo activeMarker={activeMarker} onActiveMarkerClear={onActiveMarkerClear} /> : null}

        <div className="pointer-events-auto">
          <MapStyleSwitcher />
        </div>
      </div>

      {isMobile ? (
        <div
          className={cn(
            "absolute left-4 z-5 flex flex-col items-start gap-1.5",
            showFloatingMobileMapControls ? "bottom-[calc(2.5rem+var(--floating-nav-map-offset,0rem))]" : "bottom-4",
          )}
        >
          <MapCursorInfo activeMarker={activeMarker} onActiveMarkerClear={onActiveMarkerClear} variant="mobile" />
          {mobileStatsPanel}
        </div>
      ) : null}
    </>
  );
});
