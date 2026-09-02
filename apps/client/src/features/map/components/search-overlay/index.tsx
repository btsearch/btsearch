import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet.js";
import { bandsQueryOptions, operatorsQueryOptions } from "@/features/shared/queries.js";
import { useIsMobile } from "@/hooks/useMobile.js";
import { usePreferences } from "@/hooks/usePreferences.js";
import { isEditableKeyboardTarget } from "@/lib/keyboard.js";
import { reverseGeocode } from "@/lib/mapboxGeocoding.js";
import { cn } from "@/lib/utils.js";
import type { StationFilters, StationSource } from "@/types/station.js";

import { FILTER_KEYWORDS } from "../../constants.js";
import { type StationFiltersUpdater, changeFilterSource, getMapFilterKeybindUpdater } from "../../filterKeybinds.js";
import { parseFilters } from "../../filters.js";
import { useFilterHandlers } from "../../hooks/useFilterHandlers.js";
import { useSearchState } from "../../hooks/useSearchState.js";
import {
  type SearchStation,
  type UkeSearchPermitStation,
  type UkeSearchRadioline,
  parseGpsCoordinates,
  searchLocations,
  searchStations,
  searchUkePermits,
} from "../../searchApi.js";
import { MapCursorInfo } from "../mapCursorInfo.js";
import { AutocompleteDropdown } from "./autocompleteDropdown.js";
import { FilterButton } from "./filterButton.js";
import { FilterPanel } from "./mapFilterPanel.js";
import { MapStyleSwitcher } from "./mapStyleSwitcher.js";
import { MobileStatsPanel } from "./mobileStatsPanel.js";
import { SearchInput } from "./searchInput.js";
import { type SearchOption, buildAutocompleteOptions, buildSearchResultOptions } from "./searchOptions.js";
import { type SearchFailureSource, SearchResults, type SearchSurfaceState } from "./searchResults.js";
import { StationCounter } from "./stationCounter.js";
import { useSearchNavigation } from "./useSearchNavigation.js";

const MAP_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((kw) => kw.availableOn.includes("map"));
const MAP_SEARCH_MODE_STORAGE_KEY = "map:search:affectMap";
const EMPTY_RESULTS: never[] = [];
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
  filters: StationFilters;
  zoom?: number;
  activeMarker?: { latitude: number; longitude: number } | null;
  onActiveMarkerClear?: () => void;
  onFiltersChange: (update: StationFilters | StationFiltersUpdater) => void;
  onLocationSelect?: (lat: number, lon: number) => void;
  onStationSelect?: (station: SearchStation) => void;
  onUkeStationSelect?: (station: UkeSearchPermitStation) => void;
  onRadiolineSelect?: (radioline: UkeSearchRadioline) => void;
  hideSource?: boolean;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  showPlannedMeasurements?: boolean;
  onTogglePlannedMeasurements?: () => void;
  onFilterQueryChange?: (q: string | undefined) => void;
  mapContext?: ReactElement;
};

export const MapSearchOverlay = memo(function MapSearchOverlay({
  locationCount,
  totalCount,
  radioLineCount = 0,
  radioLineTotalCount = 0,
  isRadioLinesFetching = false,
  filters,
  zoom,
  activeMarker,
  onActiveMarkerClear,
  onFiltersChange,
  onLocationSelect,
  onStationSelect,
  onUkeStationSelect,
  onRadiolineSelect,
  hideSource = false,
  showHeatmap = false,
  onToggleHeatmap,
  showPlannedMeasurements = false,
  onTogglePlannedMeasurements,
  onFilterQueryChange,
  mapContext,
}: MapSearchOverlayProps) {
  const { t } = useTranslation("main");
  const [showFilters, setShowFilters] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const filterPanelRef = useRef<HTMLFieldSetElement>(null);
  const isMobile = useIsMobile();

  const { preferences, updatePreferences } = usePreferences();
  const isUkeSource = filters.source === "uke";
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
  const handleSearchModeChange = useCallback(
    (mode: MapSearchMode) => {
      if (mode === "map" && (!supportsMapMode || isUkeSource)) return;
      setStoredSearchMode(mode);
      saveMapSearchMode(mode);
      if (mode === "map") {
        closeOverlay();
        return;
      }
      onFilterQueryChange?.(undefined);
      if (isFocused) openOverlay(true);
    },
    [closeOverlay, isFocused, isUkeSource, onFilterQueryChange, openOverlay, supportsMapMode],
  );
  const handleFiltersChange = useCallback(
    (update: StationFilters | StationFiltersUpdater) => {
      const nextFilters = typeof update === "function" ? update(filters) : update;
      if (supportsMapMode && nextFilters.source === "uke" && storedSearchMode === "map") onFilterQueryChange?.(undefined);
      if (nextFilters.source === "uke" && isFocused && query.trim() !== "") openOverlay(true, false);
      onFiltersChange(update);
    },
    [filters, isFocused, onFilterQueryChange, onFiltersChange, openOverlay, query, storedSearchMode, supportsMapMode],
  );
  const showMobileMapContext = isMobile && mapContext !== undefined && !mobileExpanded && !isFocused;

  const { data: operators = [] } = useQuery(operatorsQueryOptions());

  const { data: bands = [] } = useQuery(bandsQueryOptions());

  const uniqueBandValues = useMemo(() => {
    const values = [...new Set(bands.map((b) => b.value))];
    return values.sort((a, b) => a - b);
  }, [bands]);

  const {
    handleToggleOperator,
    handleToggleBand,
    handleToggleRat,
    handleToggleStatus,
    handleClearAllRats,
    handleClearAllBands,
    handleRecentDaysChange,
    handleRecentDateFieldChange,
    handleClearFilters,
    activeFilterCount,
  } = useFilterHandlers({ filters, onFiltersChange: handleFiltersChange });

  const gpsCoords = useMemo(() => parseGpsCoordinates(debouncedQuery), [debouncedQuery]);
  const resultsQueryEnabled = searchMode === "results" && activeOverlay === "results" && debouncedQuery.trim().length > 0;
  const canSearchInternalStations = onStationSelect !== undefined;
  const canSearchUke = onUkeStationSelect !== undefined || onRadiolineSelect !== undefined;

  const reverseGeocodeQuery = useQuery({
    queryKey: ["reverse-geocode", gpsCoords?.lat, gpsCoords?.lng],
    queryFn: () => reverseGeocode(gpsCoords!.lat, gpsCoords!.lng),
    enabled: resultsQueryEnabled && onLocationSelect !== undefined && !!gpsCoords,
    staleTime: 1000 * 60 * 60,
  });

  const gpsResult = useMemo(
    () => (gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng, address: reverseGeocodeQuery.data?.display_name ?? null } : null),
    [gpsCoords, reverseGeocodeQuery.data?.display_name],
  );

  const shouldSearchLocations = resultsQueryEnabled && onLocationSelect !== undefined && searchKeyword.trim().length >= 3;

  const locationQuery = useQuery({
    queryKey: ["geocoding-search", searchKeyword],
    queryFn: () => searchLocations(searchKeyword),
    enabled: shouldSearchLocations,
    staleTime: 1000 * 60 * 60,
    placeholderData: (previous) => previous,
  });

  const stationQuery = useQuery({
    queryKey: ["station-search", debouncedQuery, filters.source],
    queryFn: () => searchStations(debouncedQuery),
    enabled: resultsQueryEnabled && !isUkeSource && canSearchInternalStations,
    staleTime: 1000 * 60 * 5,
    placeholderData: (previous) => previous,
  });

  const ukeQuery = useQuery({
    queryKey: ["uke-search", debouncedQuery, filters.source],
    queryFn: () => searchUkePermits(debouncedQuery),
    enabled: resultsQueryEnabled && isUkeSource && canSearchUke,
    staleTime: 1000 * 60 * 5,
    placeholderData: (previous) => previous,
  });

  const locationResults = shouldSearchLocations ? (locationQuery.data ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const stationResults = isUkeSource ? EMPTY_RESULTS : (stationQuery.data ?? EMPTY_RESULTS);
  const permitResults = isUkeSource ? (ukeQuery.data?.stations ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const radiolineResults = isUkeSource ? (ukeQuery.data?.radiolines ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const builtSearchResults = useMemo(
    () =>
      buildSearchResultOptions({
        gpsResult,
        locationResults,
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
      locationResults,
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
  const failedSources: SearchFailureSource[] = [];
  if (shouldSearchLocations && locationQuery.isError) failedSources.push("locations");
  if (resultsQueryEnabled && !isUkeSource && canSearchInternalStations && stationQuery.isError) failedSources.push("stations");
  if (resultsQueryEnabled && isUkeSource && canSearchUke && ukeQuery.isError) failedSources.push("uke");

  const querySettled = query === debouncedQuery;
  const participatingQueryIsFetching =
    (shouldSearchLocations && locationQuery.fetchStatus === "fetching") ||
    (resultsQueryEnabled && !isUkeSource && canSearchInternalStations && stationQuery.fetchStatus === "fetching") ||
    (resultsQueryEnabled && isUkeSource && canSearchUke && ukeQuery.fetchStatus === "fetching");
  const hasPlaceholderData =
    (shouldSearchLocations && locationQuery.isPlaceholderData) ||
    (resultsQueryEnabled && !isUkeSource && canSearchInternalStations && stationQuery.isPlaceholderData) ||
    (resultsQueryEnabled && isUkeSource && canSearchUke && ukeQuery.isPlaceholderData);
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
    if (shouldSearchLocations && locationQuery.isError) retries.push(locationQuery.refetch());
    if (resultsQueryEnabled && !isUkeSource && canSearchInternalStations && stationQuery.isError) retries.push(stationQuery.refetch());
    if (resultsQueryEnabled && isUkeSource && canSearchUke && ukeQuery.isError) retries.push(ukeQuery.refetch());
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
        onLocationSelect(Number.parseFloat(option.result.lat), Number.parseFloat(option.result.lon));
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

  const handleGlobalKeyDown = useEffectEvent((e: globalThis.KeyboardEvent) => {
    if (isEditableKeyboardTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();

    if (key === "f" && !e.shiftKey) {
      e.preventDefault();
      (document.activeElement as HTMLElement)?.blur();
      setShowFilters((prev) => !prev);
      return;
    }

    const updateFilters = getMapFilterKeybindUpdater(key, e.shiftKey);
    if (updateFilters !== undefined) {
      e.preventDefault();
      handleFiltersChange(updateFilters);
      return;
    }

    if (e.shiftKey) return;

    switch (key) {
      case "a":
        e.preventDefault();
        updatePreferences((current) => ({ showAzimuths: !current.showAzimuths }));
        break;
      case "h":
        e.preventDefault();
        onToggleHeatmap?.();
        break;
      case "p":
        e.preventDefault();
        onTogglePlannedMeasurements?.();
        break;
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

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleSourceChange = useCallback(
    (source: StationSource) => handleFiltersChange((prev) => changeFilterSource(prev, source)),
    [handleFiltersChange],
  );
  const showFloatingMobileMapControls = isMobile && preferences.navMode === "floating";
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
      onSourceChange={handleSourceChange}
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
            className={cn("relative", showMobileMapContext ? "shrink-0" : "min-w-0 flex-1")}
          >
            <SearchInput
              inputRef={inputRef}
              inputValue={inputValue}
              parsedFilters={parsedFilters}
              focusedChipIndex={focusedChipIndex}
              isBusy={isSearchBusy}
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
                  <FilterButton showFilters={showFilters} activeFilterCount={activeFilterCount} onClick={handleToggleFilters} />
                </>
              }
            />

            {showAutocomplete && (
              <div className="max-md:absolute max-md:inset-x-0 max-md:top-full max-md:z-10">
                <AutocompleteDropdown
                  options={autocompleteOptions}
                  listboxId={listboxId}
                  activeKey={navigation.activeKey}
                  onActiveKeyChange={navigation.setActiveKey}
                  onSelect={applyAutocomplete}
                />
              </div>
            )}

            {showResults && (
              <div className="max-md:absolute max-md:inset-x-0 max-md:top-full max-md:z-10">
                <SearchResults
                  state={searchSurfaceState}
                  listboxId={listboxId}
                  activeKey={navigation.activeKey}
                  queryText={searchKeyword}
                  isGpsAddressLoading={reverseGeocodeQuery.fetchStatus === "fetching"}
                  groups={builtSearchResults.groups}
                  stationTotalCount={builtSearchResults.stationTotalCount}
                  onActiveKeyChange={navigation.setActiveKey}
                  onRetry={retryFailedSearches}
                  onSelect={selectSearchOption}
                />
              </div>
            )}
          </search>
        </div>

        {isMobile ? (
          <div className="mt-2 flex justify-end md:hidden">
            <div className="pointer-events-auto relative shrink-0">
              <MapStyleSwitcher position="search" />
            </div>
          </div>
        ) : null}

        {showFilters && !isMobile && (
          <fieldset ref={filterPanelRef} tabIndex={-1}>
            <FilterPanel
              filters={filters}
              operators={operators}
              uniqueBandValues={uniqueBandValues}
              activeFilterCount={activeFilterCount}
              onFiltersChange={handleFiltersChange}
              onToggleOperator={handleToggleOperator}
              onToggleBand={handleToggleBand}
              onToggleRat={handleToggleRat}
              onRecentDaysChange={handleRecentDaysChange}
              onRecentDateFieldChange={handleRecentDateFieldChange}
              onToggleStatus={handleToggleStatus}
              onClearAllRats={handleClearAllRats}
              onClearAllBands={handleClearAllBands}
              onClearFilters={handleClearFilters}
              hideSource={hideSource}
              showHeatmap={showHeatmap}
              onToggleHeatmap={onToggleHeatmap}
              showPlannedMeasurements={showPlannedMeasurements}
              onTogglePlannedMeasurements={onTogglePlannedMeasurements}
            />
          </fieldset>
        )}
      </div>

      {isMobile && (
        <Sheet open={showFilters} onOpenChange={setShowFilters}>
          <SheetContent side="bottom" className="max-h-[85dvh] flex flex-col gap-0 p-0 rounded-t-2xl" showCloseButton={false}>
            <SheetHeader className="px-4 py-3 border-b bg-muted/30 shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <HugeiconsIcon icon={FilterIcon} className="size-4 shrink-0" />
                  <span>{t("common:labels.filters")}</span>
                </SheetTitle>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("common:actions.clearAll")}
                  </button>
                )}
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <FilterPanel
                filters={filters}
                operators={operators}
                uniqueBandValues={uniqueBandValues}
                activeFilterCount={activeFilterCount}
                onFiltersChange={handleFiltersChange}
                onToggleOperator={handleToggleOperator}
                onToggleBand={handleToggleBand}
                onToggleRat={handleToggleRat}
                onRecentDaysChange={handleRecentDaysChange}
                onRecentDateFieldChange={handleRecentDateFieldChange}
                onToggleStatus={handleToggleStatus}
                onClearAllRats={handleClearAllRats}
                onClearAllBands={handleClearAllBands}
                onClearFilters={handleClearFilters}
                isSheet
                hideSource={hideSource}
                showHeatmap={showHeatmap}
                onToggleHeatmap={onToggleHeatmap}
                showPlannedMeasurements={showPlannedMeasurements}
                onTogglePlannedMeasurements={onTogglePlannedMeasurements}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

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
