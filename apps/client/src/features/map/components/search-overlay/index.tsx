import type { MicrowaveLink, OfficialSite } from "@openbts/shared/contract";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
  isRejectedSearchQuery,
  officialSearchQueryOptions,
  parseGpsCoordinates,
  stationSearchQueryOptions,
} from "../../searchApi";
import { MapCursorInfo } from "../mapCursorInfo";
import { FilterButton } from "./filterButton";
import { SmoothHeight, useCalmTransition } from "./mapFilterMotion";
import { FilterPanel } from "./mapFilterPanel";
import { findKeybindCountryCode } from "./mapFilterPanelRules";
import { MapStyleSwitcher } from "./mapStyleSwitcher";
import { MobileStatsPanel } from "./mobileStatsPanel";
import { SearchAssistPanel } from "./searchAssist";
import { SearchInput } from "./searchInput";
import { type SearchOption, buildSearchResultOptions, isAssistSearchOption } from "./searchOptions";
import { type SearchFailureSource, SearchResults, type SearchSurfaceState } from "./searchResultsContent";
import { StationCounter } from "./stationCounter";
import { useSearchAssistOptions } from "./useSearchAssistOptions";
import { useSearchNavigation } from "./useSearchNavigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";
import { usePreferences } from "@/hooks/usePreferences";
import { placeAtQueryOptions, placeSearchQueryOptions } from "@/lib/geo/geocoding";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

const MAP_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((kw) => kw.availableOn.includes("map"));
const MAP_SEARCH_MODE_STORAGE_KEY = "map:search:affectMap";
const MAP_KEYWORDS_BESIDE_RESULTS = 3;
const EMPTY_RESULTS: never[] = [];
const PANEL_EXPANDED = { height: "auto", opacity: 1 } as const;
const PANEL_COLLAPSED = { height: 0, opacity: 0 } as const;
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
  microwaveLinkCount?: number;
  microwaveLinkTotalCount?: number;
  isMicrowaveLinksFetching?: boolean;
  filters: MapFilters;
  mapCountries: MapCountries;
  zoom?: number;
  activeMarker?: { latitude: number; longitude: number } | null;
  onActiveMarkerClear?: () => void;
  onFiltersChange: (update: MapFiltersChange) => void;
  onLocationSelect?: (lat: number, lon: number) => void;
  onStationSelect?: (station: StationSearchHit) => void;
  onOfficialSiteSelect?: (site: OfficialSite) => void;
  onMicrowaveLinkSelect?: (microwaveLink: MicrowaveLink) => void;
  onToggleHeatmap?: () => void;
  onTogglePlannedMeasurements?: () => void;
  onFilterQueryChange?: (q: string | undefined) => void;
  rejectedSearchText?: string;
  mapContext?: ReactElement;
};

function SearchPanelFrame({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent();
  const transition = useCalmTransition();

  return (
    <motion.div
      inert={!isPresent}
      initial={PANEL_COLLAPSED}
      animate={PANEL_EXPANDED}
      exit={PANEL_COLLAPSED}
      transition={transition}
      className={cn("relative z-10 overflow-hidden rounded-b-2xl", !isPresent && "group-data-compact/search:hidden")}
    >
      <SmoothHeight className="m-0" contentClassName="p-0">
        <div className="flex max-h-[min(85dvh,calc(100dvh-8rem-var(--floating-nav-map-offset,0rem)-var(--top-viewport-obstruction,0px)))] min-h-0 flex-col">
          {children}
        </div>
      </SmoothHeight>
    </motion.div>
  );
}

export const MapSearchOverlay = memo(function MapSearchOverlay({
  locationCount,
  totalCount,
  microwaveLinkCount = 0,
  microwaveLinkTotalCount = 0,
  isMicrowaveLinksFetching = false,
  filters,
  mapCountries,
  zoom,
  activeMarker,
  onActiveMarkerClear,
  onFiltersChange,
  onLocationSelect,
  onStationSelect,
  onOfficialSiteSelect,
  onMicrowaveLinkSelect,
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
  const isOfficialSource = filters.source === "official";
  const supportsMapMode = onFilterQueryChange !== undefined;
  const [storedSearchMode, setStoredSearchMode] = useState<MapSearchMode>(loadMapSearchMode);
  const searchMode = supportsMapMode && !isOfficialSource ? storedSearchMode : "results";

  const {
    query,
    inputValue,
    debouncedQuery,
    debouncedInput: searchKeyword,
    isFocused,
    statsSearchMode,
    parsedFilters,
    assist,
    isPickerOpen,
    invalidChipIndexes,
    queryProblem,
    activeOverlay,
    containerRef,
    inputRef,
    focusedChipIndex,
    handleContainerBlur,
    handleInputChange: changeSearchInput,
    handleInputFocus: focusSearchInput,
    handleInputClick: clickSearchInput,
    openOverlay,
    handleKeyDown: handleChipKeyDown,
    selectAssistOption,
    openChipPicker,
    goBack,
    forgetRecent,
    rememberQuery,
    fixQueryProblem,
    clearSearch,
    removeFilter,
    closeOverlay,
  } = useSearchState({
    filterKeywords: isOfficialSource ? EMPTY_RESULTS : MAP_FILTER_KEYWORDS,
    parseFilters,
    recentScope: "map",
    resultsEnabled: searchMode === "results",
  });

  function handleFiltersChange(update: MapFiltersChange) {
    const nextFilters = typeof update === "function" ? update(filters) : update;
    if (supportsMapMode && nextFilters.source === "official" && storedSearchMode === "map") onFilterQueryChange?.(undefined);
    if (nextFilters.source === "official" && isFocused && query.trim() !== "" && (isMobile || !showFilters)) openOverlay(true);
    onFiltersChange(update);
  }

  const maxBounds = useMemo(() => (lookups === undefined ? undefined : getMapMaxBounds(lookups.countries)), [lookups]);
  const gpsCoords = useMemo(() => parseGpsCoordinates(debouncedQuery, maxBounds), [debouncedQuery, maxBounds]);
  const gpsPoint = gpsCoords === null ? null : { latitude: gpsCoords.lat, longitude: gpsCoords.lng };
  const resultsQueryEnabled = searchMode === "results" && activeOverlay === "results" && debouncedQuery.trim().length > 0;
  const canSearchInternalStations = onStationSelect !== undefined;
  const canSearchOfficial = onOfficialSiteSelect !== undefined || onMicrowaveLinkSelect !== undefined;
  const shouldSearchStations = resultsQueryEnabled && !isOfficialSource && canSearchInternalStations;
  const shouldSearchOfficial = resultsQueryEnabled && isOfficialSource && canSearchOfficial;

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

  const officialQuery = useQuery({
    ...officialSearchQueryOptions(debouncedQuery),
    enabled: shouldSearchOfficial,
    placeholderData: keepPreviousData,
  });

  const locationResults = shouldSearchLocations ? (locationQuery.data ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const locationSource = locationResults.at(0)?.source ?? null;
  const stationResults = isOfficialSource ? EMPTY_RESULTS : (stationQuery.data?.hits ?? EMPTY_RESULTS);
  const officialSiteResults = isOfficialSource ? (officialQuery.data?.sites ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const microwaveLinkResults = isOfficialSource ? (officialQuery.data?.microwaveLinks ?? EMPTY_RESULTS) : EMPTY_RESULTS;
  const builtSearchResults = useMemo(
    () =>
      buildSearchResultOptions({
        gpsResult,
        gpsSource,
        locationResults,
        locationSource,
        stationResults,
        officialSiteResults,
        microwaveLinkResults,
        capabilities: {
          location: onLocationSelect !== undefined,
          station: onStationSelect !== undefined,
          officialSite: onOfficialSiteSelect !== undefined,
          microwaveLink: onMicrowaveLinkSelect !== undefined,
        },
      }),
    [
      gpsResult,
      gpsSource,
      locationResults,
      locationSource,
      onLocationSelect,
      onMicrowaveLinkSelect,
      onStationSelect,
      onOfficialSiteSelect,
      officialSiteResults,
      microwaveLinkResults,
      stationResults,
    ],
  );
  const searchResultOptions = builtSearchResults.options;
  const showsStationGroup = builtSearchResults.groups.some((group) => group.kind === "station");
  const stationTotalCount = showsStationGroup ? (stationQuery.data?.total ?? 0) : 0;
  const showDesktopFilters = showFilters && !isMobile;
  const canShowSearch = !showDesktopFilters;
  const shownAssist = isOfficialSource ? null : assist;
  const showResults = canShowSearch && searchMode === "results" && activeOverlay === "results";
  const showAssist = canShowSearch && shownAssist !== null && activeOverlay === "assist";
  const showKeywordGroup = showResults && shownAssist?.view === "keywords";
  const { options: assistOptions, areValuesLoading } = useSearchAssistOptions(
    shownAssist,
    searchMode === "results" ? MAP_KEYWORDS_BESIDE_RESULTS : undefined,
  );
  const resultNavigationOptions = useMemo(
    () => (shownAssist?.view === "keywords" ? [...assistOptions, ...searchResultOptions] : searchResultOptions),
    [assistOptions, searchResultOptions, shownAssist?.view],
  );
  const isMobileSearchExpanded = mobileExpanded || showAssist || showResults;
  const isMobileSearchCollapsed = isMobile && !isMobileSearchExpanded && !isFocused;
  const showMobileMapContext = isMobileSearchCollapsed && mapContext !== undefined;
  const opensAssist = shownAssist !== null && (shownAssist.view !== "keywords" || searchMode !== "results");

  let navigationOptions: SearchOption[] = EMPTY_RESULTS;
  if (showAssist || (!showResults && opensAssist)) navigationOptions = assistOptions;
  else if (showResults || searchMode === "results") navigationOptions = resultNavigationOptions;
  const listboxId = useId();
  const navigationResetKey = `${searchMode}:${isPickerOpen ? `picker:${inputValue}` : query}:${shownAssist?.view ?? ""}`;
  const navigation = useSearchNavigation(navigationOptions, listboxId, navigationResetKey);

  function handleToggleFilters() {
    if (!showFilters && !isMobile) {
      closeOverlay();
      navigation.reset();
    }
    setShowFilters((prev) => !prev);
  }

  useEffect(() => {
    if (searchMode !== "map") {
      onFilterQueryChange?.(undefined);
      return;
    }
    onFilterQueryChange?.(debouncedQuery || undefined);
  }, [debouncedQuery, onFilterQueryChange, searchMode]);

  useMapKeybinds(({ key, shiftKey }) => {
    if (key === "f" && !shiftKey) {
      (document.activeElement as HTMLElement)?.blur();
      handleToggleFilters();
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
      operatorIds: listKeybindOperatorIds(lookups, findKeybindCountryCode(filters, mapCountries, lookups?.countries)),
      capabilities: mapCountries.capabilities,
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
        if (!mapCountries.capabilities.emf) return false;
        onTogglePlannedMeasurements?.();
        return true;
      default:
        return false;
    }
  });

  useEffect(() => {
    if (!preferences.hideFiltersOnMapClick || !showFilters) return;
    const searchContainer = containerRef.current;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (searchContainer?.contains(target) || filterPanelRef.current?.contains(target)) return;
      if ((target as Element)?.closest("[data-filter-toggle]")) return;
      setShowFilters(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [containerRef, preferences.hideFiltersOnMapClick, showFilters]);

  const hasLocationSearchFailed = shouldSearchLocations && locationQuery.isError;
  const hasStationSearchFailed = shouldSearchStations && stationQuery.isError && !isRejectedSearchQuery(stationQuery.error);
  const hasOfficialSearchFailed = shouldSearchOfficial && officialQuery.isError;
  const failedSources: SearchFailureSource[] = [];
  if (hasLocationSearchFailed) failedSources.push("locations");
  if (hasStationSearchFailed) failedSources.push("stations");
  if (hasOfficialSearchFailed) failedSources.push("official");

  const querySettled = query === debouncedQuery;
  const participatingQueryIsFetching =
    (shouldSearchLocations && locationQuery.fetchStatus === "fetching") ||
    (shouldSearchStations && stationQuery.fetchStatus === "fetching") ||
    (shouldSearchOfficial && officialQuery.fetchStatus === "fetching");
  const hasPlaceholderData =
    (shouldSearchLocations && locationQuery.isPlaceholderData) ||
    (shouldSearchStations && stationQuery.isPlaceholderData) ||
    (shouldSearchOfficial && officialQuery.isPlaceholderData);
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
  const hasActiveListbox = showAssist || (showResults && (searchSurfaceState.kind === "ready" || showKeywordGroup));
  const controlledListboxIds = [
    showAssist || showKeywordGroup ? `${listboxId}-assist` : null,
    showResults && searchSurfaceState.kind === "ready" ? listboxId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const isStationQueryRejected = shouldSearchStations && querySettled && stationQuery.isError && isRejectedSearchQuery(stationQuery.error);

  function handleSearchModeChange(mode: MapSearchMode) {
    if (mode === "map" && (!supportsMapMode || isOfficialSource)) return;
    setStoredSearchMode(mode);
    saveMapSearchMode(mode);
    if (mode === "map") {
      closeOverlay();
      return;
    }
    if (!isMobile) setShowFilters(false);
    onFilterQueryChange?.(undefined);
    if (isFocused) openOverlay(true);
  }

  function retryFailedSearches() {
    const retries: Promise<unknown>[] = [];
    if (hasLocationSearchFailed) retries.push(locationQuery.refetch());
    if (hasStationSearchFailed) retries.push(stationQuery.refetch());
    if (hasOfficialSearchFailed) retries.push(officialQuery.refetch());
    void Promise.allSettled(retries);
  }

  function selectSearchOption(option: SearchOption | undefined) {
    if (!option) return;
    if (isAssistSearchOption(option)) {
      if (option.kind !== "value") navigation.reset();
      selectAssistOption(option);
      return;
    }
    navigation.reset();
    rememberQuery();

    switch (option.kind) {
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
      case "official-site":
        if (!onOfficialSiteSelect) return;
        onOfficialSiteSelect(option.result);
        break;
      case "microwave-link":
        if (!onMicrowaveLinkSelect) return;
        onMicrowaveLinkSelect(option.result);
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
      if (!activeOverlay || (!isMobile && showFilters)) handleInputClick();
      navigation.move(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter" && (showAssist || showResults) && navigationOptions.length > 0) {
      e.preventDefault();
      selectSearchOption(navigation.activeOption ?? (showResults ? searchResultOptions[0] : navigationOptions[0]));
      return;
    }
    const activeOption = navigation.activeOption;
    if (e.key === "Delete" && e.shiftKey && activeOption?.kind === "recent") {
      e.preventDefault();
      forgetRecent(activeOption.query);
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
    const nextTarget = event.relatedTarget as Node | null;
    const filterPanel = filterPanelRef.current;
    if (filterPanel?.contains(event.target) && filterPanel.contains(nextTarget)) return;
    handleContainerBlur(event, filterPanel);
    if (containerRef.current?.contains(nextTarget) && !filterPanel?.contains(nextTarget)) return;
    navigation.reset();
    handleMobileCollapse();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isMobile) setShowFilters(false);
    changeSearchInput(event);
  }

  function handleInputFocus() {
    if (!isMobile) setShowFilters(false);
    focusSearchInput();
  }

  function handleInputClick() {
    if (!isMobile) setShowFilters(false);
    clickSearchInput();
  }

  function handleSourceChange(source: StationSource) {
    handleFiltersChange((current) => changeMapFilterSource(current, source));
  }

  const showFloatingMobileMapControls = isMobile && preferences.navMode === "floating";
  const activeFilterCount = countActiveMapFilters(filters, lookups?.operators, lookups?.countries);
  const mobileStatsPanel = (
    <MobileStatsPanel
      locationCount={locationCount}
      totalCount={totalCount}
      microwaveLinkCount={microwaveLinkCount}
      microwaveLinkTotalCount={microwaveLinkTotalCount}
      isMicrowaveLinksFetching={isMicrowaveLinksFetching}
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
        className={cn("absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-105 z-10", (showFilters || showResults || showAssist) && "z-20")}
      >
        <div className="flex items-start gap-2">
          {showMobileMapContext ? <div className="min-w-0 flex-1 overflow-hidden">{mapContext}</div> : null}

          <search
            ref={containerRef}
            onBlurCapture={handleSearchBlur}
            data-compact={isMobileSearchCollapsed ? "" : undefined}
            className={cn(
              "group/search relative rounded-2xl border bg-background/95 shadow-xl backdrop-blur-md transition-[border-color,box-shadow] duration-200",
              isFocused && "border-primary/30 ring-2 ring-primary/20",
              isMobileSearchCollapsed ? "ml-auto shrink-0" : "min-w-0 flex-1",
            )}
          >
            <SearchInput
              inputRef={inputRef}
              inputValue={inputValue}
              parsedFilters={parsedFilters}
              focusedChipIndex={focusedChipIndex}
              invalidChipIndexes={invalidChipIndexes}
              isBusy={isSearchBusy}
              isQueryRejected={rejectedSearchText === query || isStationQueryRejected}
              queryProblem={queryProblem}
              query={query}
              isFocused={isFocused}
              isMobile={isMobile}
              mobileExpanded={isMobileSearchExpanded}
              listboxId={hasActiveListbox ? controlledListboxIds : undefined}
              activeOptionId={hasActiveListbox ? navigation.activeOptionId : undefined}
              isExpanded={hasActiveListbox}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onInputFocus={handleInputFocus}
              onInputClick={handleInputClick}
              onRemoveFilter={removeFilter}
              onEditFilter={openChipPicker}
              onFixQuery={fixQueryProblem}
              onClearSearch={clearSearch}
              onMobileExpand={handleMobileExpand}
              mode={searchMode}
              showModeControl={supportsMapMode && !isOfficialSource}
              onModeChange={handleSearchModeChange}
              filterSlot={
                <>
                  <div className="h-6 w-px bg-border shrink-0" />
                  <FilterButton
                    showFilters={showFilters}
                    activeFilterCount={activeFilterCount}
                    panelId={showDesktopFilters ? filterPanelId : undefined}
                    onClick={handleToggleFilters}
                  />
                </>
              }
              mobileControls={
                isMobile ? (
                  <div className={cn("flex justify-end md:hidden", (showAssist || showResults) && "invisible")}>
                    <div className="pointer-events-auto relative shrink-0">
                      <MapStyleSwitcher position="search" />
                    </div>
                  </div>
                ) : undefined
              }
            />

            <AnimatePresence>
              {showAssist || showResults || showDesktopFilters ? (
                <SearchPanelFrame key="panels">
                  {(showAssist || showKeywordGroup) && shownAssist !== null ? (
                    <SearchAssistPanel
                      embedded
                      withFooter={showAssist}
                      assist={shownAssist}
                      options={assistOptions}
                      areValuesLoading={areValuesLoading}
                      listboxId={listboxId}
                      activeKey={navigation.activeKey}
                      onActiveKeyChange={navigation.setActiveKey}
                      onSelect={selectSearchOption}
                      onForgetRecent={forgetRecent}
                      onBack={goBack}
                    />
                  ) : null}
                  {showResults ? (
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
                  ) : null}
                  {showDesktopFilters ? (
                    <fieldset id={filterPanelId} ref={filterPanelRef} tabIndex={-1} className="flex max-h-[inherit] min-h-0 min-w-0 flex-col">
                      {filterPanel}
                    </fieldset>
                  ) : null}
                </SearchPanelFrame>
              ) : null}
            </AnimatePresence>
          </search>
        </div>
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
            microwaveLinkCount={microwaveLinkCount}
            microwaveLinkTotalCount={microwaveLinkTotalCount}
            isMicrowaveLinksFetching={isMicrowaveLinksFetching}
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
