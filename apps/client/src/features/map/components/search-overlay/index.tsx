import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet.js";
import { useNavActionTarget } from "@/contexts/navActions.js";
import { bandsQueryOptions, operatorsQueryOptions } from "@/features/shared/queries.js";
import { useIsMobile } from "@/hooks/useMobile.js";
import { usePreferences } from "@/hooks/usePreferences.js";
import { reverseGeocode } from "@/lib/mapboxGeocoding.js";
import { cn } from "@/lib/utils.js";
import type { Station, StationFilters, StationSource } from "@/types/station.js";

import { FILTER_KEYWORDS } from "../../constants.js";
import { parseFilters } from "../../filters.js";
import { useFilterHandlers } from "../../hooks/useFilterHandlers.js";
import { useSearchState } from "../../hooks/useSearchState.js";
import {
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
import { FilterPanel } from "./filterPanel.js";
import { MapStyleSwitcher } from "./mapStyleSwitcher.js";
import { MobileStatsPanel } from "./mobileStatsPanel.js";
import { SearchInput } from "./searchInput.js";
import { SearchResults } from "./searchResults.js";
import { StationCounter } from "./stationCounter.js";

const MAP_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((kw) => kw.availableOn.includes("map"));

type MapSearchOverlayProps = {
  locationCount: number;
  totalCount: number;
  radioLineCount?: number;
  radioLineTotalCount?: number;
  isRadioLinesFetching?: boolean;
  isLoading: boolean;
  isFetching?: boolean;
  filters: StationFilters;
  zoom?: number;
  activeMarker?: { latitude: number; longitude: number } | null;
  onActiveMarkerClear?: () => void;
  onFiltersChange: (filters: StationFilters) => void;
  onLocationSelect?: (lat: number, lon: number) => void;
  onStationSelect?: (station: Station) => void;
  onUkeStationSelect?: (station: UkeSearchPermitStation) => void;
  onRadiolineSelect?: (radioline: UkeSearchRadioline) => void;
  hideSource?: boolean;
  hideAPIFilters?: boolean;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  showPlannedMeasurements?: boolean;
  onTogglePlannedMeasurements?: () => void;
  onFilterQueryChange?: (q: string | undefined) => void;
};

export const MapSearchOverlay = memo(function MapSearchOverlay({
  locationCount,
  totalCount,
  radioLineCount = 0,
  radioLineTotalCount = 0,
  isRadioLinesFetching = false,
  isLoading,
  isFetching = false,
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
  hideAPIFilters = false,
  showHeatmap = false,
  onToggleHeatmap,
  showPlannedMeasurements = false,
  onTogglePlannedMeasurements,
  onFilterQueryChange,
}: MapSearchOverlayProps) {
  const { t } = useTranslation("main");
  const [showFilters, setShowFilters] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const filterPanelRef = useRef<HTMLFieldSetElement>(null);
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();

  const { preferences, updatePreferences } = usePreferences();
  const [affectMap, setAffectMap] = useState<boolean>(() => {
    try {
      return localStorage.getItem("map:search:affectMap") === "true";
    } catch {
      return false;
    }
  });

  const handleAffectMapChange = useCallback(
    (v: boolean) => {
      setAffectMap(v);
      try {
        localStorage.setItem("map:search:affectMap", String(v));
      } catch {}
      if (!v) onFilterQueryChange?.(undefined);
    },
    [onFilterQueryChange],
  );

  const {
    query,
    inputValue,
    debouncedQuery,
    isFocused,
    searchMode,
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
    handleKeyDown: handleChipKeyDown,
    applyAutocomplete,
    clearSearch,
    removeFilter,
    closeOverlay,
  } = useSearchState({ filterKeywords: MAP_FILTER_KEYWORDS, parseFilters, affectMap });

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
    handleSelectAllRats,
    handleClearAllRats,
    handleSelectAllBands,
    handleClearAllBands,
    handleRecentDaysChange,
    handleRecentDateFieldChange,
    handleClearFilters,
    activeFilterCount,
  } = useFilterHandlers({ filters, uniqueBandValues, onFiltersChange });

  const searchKeyword = parseFilters(debouncedQuery).remainingText;

  const isUkeSource = filters.source === "uke";

  const gpsCoords = useMemo(() => parseGpsCoordinates(debouncedQuery), [debouncedQuery]);

  const { data: reverseGeocodeResult, isLoading: isReverseGeocodeLoading } = useQuery({
    queryKey: ["reverse-geocode", gpsCoords?.lat, gpsCoords?.lng],
    queryFn: () => reverseGeocode(gpsCoords!.lat, gpsCoords!.lng),
    enabled: !!gpsCoords,
    staleTime: 1000 * 60 * 60,
  });

  const gpsResult = gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng, address: reverseGeocodeResult?.display_name ?? null } : null;

  const shouldSearchLocations = searchKeyword.trim().length >= 3 && activeOverlay !== "autocomplete" && autocompleteOptions.length === 0;
  const shouldShowSearchResults = !affectMap;

  const { data: locationResults = [], isLoading: isLocationSearchLoading } = useQuery({
    queryKey: ["geocoding-search", searchKeyword],
    queryFn: () => searchLocations(searchKeyword),
    enabled: shouldSearchLocations,
    staleTime: 1000 * 60 * 60,
  });

  const { data: rawStationResults, isLoading: isStationSearchLoading } = useQuery({
    queryKey: ["station-search", debouncedQuery, filters.source],
    queryFn: () => searchStations(debouncedQuery),
    enabled: !isUkeSource && debouncedQuery.trim().length > 0 && shouldShowSearchResults,
    staleTime: 1000 * 60 * 5,
  });

  const { data: ukeSearchResult, isLoading: isUkeSearchLoading } = useQuery({
    queryKey: ["uke-search", debouncedQuery, filters.source],
    queryFn: () => searchUkePermits(debouncedQuery),
    enabled: isUkeSource && debouncedQuery.trim().length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const stationResults = isUkeSource ? [] : (rawStationResults ?? []);
  const permitResults = isUkeSource ? (ukeSearchResult?.stations ?? []) : [];
  const radiolineResults = isUkeSource ? (ukeSearchResult?.radiolines ?? []) : [];

  const isSearching = isLocationSearchLoading || isStationSearchLoading || isUkeSearchLoading || isReverseGeocodeLoading;
  const showAutocomplete = !isUkeSource && activeOverlay === "autocomplete" && autocompleteOptions.length > 0;
  const showResults =
    activeOverlay === "results" &&
    (isSearching ||
      !!gpsResult ||
      locationResults.length > 0 ||
      stationResults.length > 0 ||
      permitResults.length > 0 ||
      radiolineResults.length > 0);

  useEffect(() => {
    if (!affectMap) {
      onFilterQueryChange?.(undefined);
      return;
    }
    onFilterQueryChange?.(debouncedQuery || undefined);
  }, [affectMap, debouncedQuery, onFilterQueryChange]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    handleChipKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      if (activeOverlay) {
        closeOverlay();
      } else {
        inputRef.current?.blur();
        setShowFilters(false);
      }
    }
    if (e.key === "Enter" && activeOverlay === "autocomplete" && autocompleteOptions.length > 0) {
      e.preventDefault();
      applyAutocomplete(autocompleteOptions[0].key);
    }
  }

  function handleMobileExpand() {
    setMobileExpanded(true);
  }

  function handleMobileCollapse() {
    setMobileExpanded(false);
  }

  function handleToggleFilters() {
    setShowFilters((prev) => !prev);
  }

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
    const OPERATOR_KEYBINDS: Record<string, number> = { "1": 26001, "2": 26002, "3": 26003, "4": 26006 };
    const RAT_KEYBINDS: Record<string, string> = { g: "GSM", u: "UMTS", l: "LTE", n: "NR", i: "iot" };

    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey) return;
      const key = e.key?.toLowerCase();

      if (key === "f") {
        e.preventDefault();
        if (e.shiftKey) handleClearFilters();
        else {
          (document.activeElement as HTMLElement)?.blur();
          setShowFilters((prev) => !prev);
        }
        return;
      }

      if (e.shiftKey) {
        if (key in RAT_KEYBINDS) {
          e.preventDefault();
          handleToggleRat(RAT_KEYBINDS[key]);
        }
        return;
      }

      switch (key) {
        case "s":
          e.preventDefault();
          onFiltersChange({ ...filters, showStations: !filters.showStations });
          break;
        case "r":
          e.preventDefault();
          onFiltersChange({ ...filters, showRadiolines: !filters.showRadiolines });
          break;
        case "a":
          e.preventDefault();
          updatePreferences({ showAzimuths: !preferences.showAzimuths });
          break;
        case "h":
          e.preventDefault();
          onToggleHeatmap?.();
          break;
        case "p":
          e.preventDefault();
          onTogglePlannedMeasurements?.();
          break;
        case "z":
          e.preventDefault();
          onFiltersChange({ ...filters, source: filters.source === "uke" ? "internal" : "uke" });
          break;
        case "n":
          e.preventDefault();
          onFiltersChange({ ...filters, recentDays: filters.recentDays === null ? 30 : null });
          break;
        default:
          if (e.key in OPERATOR_KEYBINDS) {
            e.preventDefault();
            handleToggleOperator(OPERATOR_KEYBINDS[e.key]);
          }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleClearFilters,
    filters,
    onFiltersChange,
    onToggleHeatmap,
    onTogglePlannedMeasurements,
    handleToggleOperator,
    handleToggleRat,
    preferences.showAzimuths,
    updatePreferences,
  ]);

  const handleSourceChange = useCallback((source: StationSource) => onFiltersChange({ ...filters, source }), [filters, onFiltersChange]);
  const showFloatingMobileMapControls = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const mobileStatsPanel = (
    <MobileStatsPanel
      locationCount={locationCount}
      totalCount={totalCount}
      radioLineCount={radioLineCount}
      radioLineTotalCount={radioLineTotalCount}
      isRadioLinesFetching={isRadioLinesFetching}
      isLoading={isLoading}
      isFetching={isFetching}
      showStations={filters.showStations}
      searchMode={searchMode as "bounds" | "search"}
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
        <SearchInput
          containerRef={containerRef}
          inputRef={inputRef}
          inputValue={inputValue}
          parsedFilters={parsedFilters}
          focusedChipIndex={focusedChipIndex}
          isSearching={isSearching}
          query={query}
          isFocused={isFocused}
          mobileExpanded={mobileExpanded}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onInputFocus={handleInputFocus}
          onInputClick={handleInputClick}
          onRemoveFilter={removeFilter}
          onClearSearch={clearSearch}
          onContainerBlur={handleContainerBlur}
          onMobileExpand={handleMobileExpand}
          onMobileCollapse={handleMobileCollapse}
          affectMap={affectMap}
          showAffectMap={filters.source !== "uke"}
          onAffectMapChange={handleAffectMapChange}
          filterSlot={
            <>
              <div className="h-6 w-px bg-border shrink-0" />
              <FilterButton showFilters={showFilters} activeFilterCount={activeFilterCount} onClick={handleToggleFilters} />
            </>
          }
        />

        {isMobile ? (
          <div className="mt-2 flex justify-end md:hidden">
            <div className="pointer-events-auto relative shrink-0">
              <MapStyleSwitcher position="search" />
            </div>
          </div>
        ) : null}

        {showAutocomplete && <AutocompleteDropdown options={autocompleteOptions} onSelect={applyAutocomplete} />}

        {showResults && (
          <SearchResults
            show
            isLoading={isSearching}
            gpsResult={gpsResult}
            locationResults={locationResults}
            stationResults={stationResults}
            permitResults={permitResults}
            radiolineResults={radiolineResults}
            onLocationSelect={onLocationSelect}
            onStationSelect={onStationSelect}
            onUkeStationSelect={onUkeStationSelect}
            onRadiolineSelect={onRadiolineSelect}
            onClose={closeOverlay}
          />
        )}

        {showFilters && !isMobile && (
          <fieldset ref={filterPanelRef} tabIndex={-1}>
            <FilterPanel
              filters={filters}
              operators={operators}
              uniqueBandValues={uniqueBandValues}
              activeFilterCount={activeFilterCount}
              onFiltersChange={onFiltersChange}
              onToggleOperator={handleToggleOperator}
              onToggleBand={handleToggleBand}
              onToggleRat={handleToggleRat}
              onRecentDaysChange={handleRecentDaysChange}
              onRecentDateFieldChange={handleRecentDateFieldChange}
              onToggleStatus={handleToggleStatus}
              onSelectAllRats={handleSelectAllRats}
              onClearAllRats={handleClearAllRats}
              onSelectAllBands={handleSelectAllBands}
              onClearAllBands={handleClearAllBands}
              onClearFilters={handleClearFilters}
              hideSource={hideSource}
              hideAPIFilters={hideAPIFilters}
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
                onFiltersChange={onFiltersChange}
                onToggleOperator={handleToggleOperator}
                onToggleBand={handleToggleBand}
                onToggleRat={handleToggleRat}
                onRecentDaysChange={handleRecentDaysChange}
                onRecentDateFieldChange={handleRecentDateFieldChange}
                onToggleStatus={handleToggleStatus}
                onSelectAllRats={handleSelectAllRats}
                onClearAllRats={handleClearAllRats}
                onSelectAllBands={handleSelectAllBands}
                onClearAllBands={handleClearAllBands}
                onClearFilters={handleClearFilters}
                isSheet
                hideSource={hideSource}
                hideAPIFilters={hideAPIFilters}
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
