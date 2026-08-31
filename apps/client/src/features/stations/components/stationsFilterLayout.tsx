import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  DatabaseIcon,
  FilterIcon,
  FullSignalIcon,
  Location01Icon,
  Radar01Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button } from "@/components/ui/button";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { useNavActionTarget } from "@/contexts/navActions";
import { AutocompleteDropdown } from "@/features/map/components/search-overlay/autocompleteDropdown";
import { FILTER_KEYWORDS } from "@/features/map/constants";
import { getAutocompleteMatches, replaceLastSearchToken } from "@/features/map/searchAutocomplete";
import { ResponsiveFilters } from "@/features/stations/components/responsiveFilters";
import { StationsDataTable } from "@/features/stations/components/stationsDataTable";
import type { useStationsData } from "@/features/stations/hooks/useStationsData";
import { useIsMobile } from "@/hooks/useMobile";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator, Region, Station, StationFilters, StationSortBy, StationStatus } from "@/types/station";

import { getStationStatusFilterCount, toggleStationStatusSelection } from "../stationStatus";
import { StationStatusFilter } from "./stationStatusFilter";

const RAT_OPTIONS = [
  { value: "NR", label: "NR", gen: "5G" },
  { value: "LTE", label: "LTE", gen: "4G" },
  { value: "UMTS", label: "UMTS", gen: "3G" },
  { value: "GSM", label: "GSM", gen: "2G" },
  { value: "iot", label: "IoT", gen: "NB" },
] as const;

const STATIONS_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((keyword) => keyword.availableOn.includes("stations"));

interface StationsListLayoutProps {
  data: ReturnType<typeof useStationsData>;
  onRowClick: (station: Station) => void;
  getRowHref?: (station: Station) => string;
  headerActions?: ReactNode;
  children?: ReactNode;
}

type StationsMobileFilterRailProps = {
  filters: StationFilters;
  operators: Operator[];
  regions: Region[];
  uniqueBandValues: number[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (filters: StationFilters) => void;
  onRegionsChange: (regionIds: number[]) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  hasActiveFilters: boolean;
  stationCount: number;
  totalStations?: number;
};

function StationsMobileFilterRail({
  filters,
  operators,
  regions,
  uniqueBandValues,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  hasActiveFilters,
  stationCount,
  totalStations,
}: StationsMobileFilterRailProps) {
  const { t } = useTranslation(["stations", "common", "main"]);
  const topOperators = useMemo(
    () => operators.filter((op) => TOP4_MNCS.includes(op.mnc)).sort((a, b) => TOP4_MNCS.indexOf(a.mnc) - TOP4_MNCS.indexOf(b.mnc)),
    [operators],
  );
  const otherOperators = useMemo(() => operators.filter((op) => !TOP4_MNCS.includes(op.mnc)), [operators]);
  const selectedRegionNames = useMemo(
    () => selectedRegions.map((id) => regions.find((region) => region.id === id)?.name).filter((name): name is string => Boolean(name)),
    [regions, selectedRegions],
  );
  const statusFilterCount = getStationStatusFilterCount(filters.status);
  const hasSearch = searchQuery.trim().length > 0;
  const [showSearchAutocomplete, setShowSearchAutocomplete] = useState(false);
  const searchAutocompleteOptions = useMemo(() => getAutocompleteMatches(searchQuery, STATIONS_FILTER_KEYWORDS), [searchQuery]);

  const handleAutocompleteSelect = (keyword: string) => {
    onSearchQueryChange(replaceLastSearchToken(searchQuery, keyword));
    setShowSearchAutocomplete(false);
  };

  const handleToggleStatus = (status: StationStatus) => {
    onFiltersChange({ ...filters, status: toggleStationStatusSelection(filters.status, status) });
  };

  const handleClearFilters = () => {
    onClearAllFilters();
    setShowSearchAutocomplete(false);
  };

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip
        active={hasSearch}
        icon={Search02Icon}
        label={t("common:labels.search")}
        contentClassName="overflow-visible"
        onOpenChange={(open) => {
          if (!open) setShowSearchAutocomplete(false);
        }}
      >
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search02Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={searchQuery}
            onChange={(event) => {
              onSearchQueryChange(event.currentTarget.value);
              setShowSearchAutocomplete(true);
            }}
            onFocus={() => setShowSearchAutocomplete(true)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (!event.currentTarget.parentElement?.contains(nextTarget)) setShowSearchAutocomplete(false);
            }}
            placeholder={t("common:placeholder.search")}
            className="h-9 w-full rounded-md border bg-background py-2 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => {
                onSearchQueryChange("");
                setShowSearchAutocomplete(false);
              }}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
          {showSearchAutocomplete && searchAutocompleteOptions.length > 0 ? (
            <div className="absolute bottom-full left-0 z-10 mb-2 w-full [&>div]:mt-0">
              <AutocompleteDropdown options={searchAutocompleteOptions} onSelect={handleAutocompleteSelect} />
            </div>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={filters.operators.length > 0} count={filters.operators.length} icon={FilterIcon} label={t("common:labels.operator")}>
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {[...topOperators, ...otherOperators].map((operator) => {
            const selected = filters.operators.includes(operator.mnc);
            return (
              <button
                key={operator.mnc}
                type="button"
                onClick={() => onFiltersChange({ ...filters, operators: toggleValue(filters.operators, operator.mnc) })}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                <span className="min-w-0 flex-1 truncate">{operator.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={selectedRegions.length > 0} count={selectedRegions.length} icon={Location01Icon} label={t("common:labels.region")}>
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {regions.map((region) => {
            const selected = selectedRegions.includes(region.id);
            return (
              <button
                key={region.id}
                type="button"
                onClick={() => onRegionsChange(toggleValue(selectedRegions, region.id))}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{region.name}</span>
              </button>
            );
          })}
        </div>
        {selectedRegionNames.length > 0 ? <div className="px-1 text-xs text-muted-foreground">{selectedRegionNames.join(", ")}</div> : null}
      </MobileFilterChip>

      <MobileFilterChip active={filters.rat.length > 0} count={filters.rat.length} icon={FullSignalIcon} label={t("common:labels.standard")}>
        <MobileFilterPanelTitle>{t("common:labels.standard")}</MobileFilterPanelTitle>
        <div className="grid grid-cols-2 gap-1">
          {RAT_OPTIONS.map((rat) => {
            const selected = filters.rat.includes(rat.value);
            return (
              <button
                key={rat.value}
                type="button"
                onClick={() => onFiltersChange({ ...filters, rat: toggleValue(filters.rat, rat.value) })}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-2 text-left transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="font-mono text-[10px] text-muted-foreground">{rat.gen}</span>
                <span className="text-xs font-medium">{rat.label}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={filters.bands.length > 0} count={filters.bands.length} icon={Radar01Icon} label={t("common:labels.band")}>
        <MobileFilterPanelTitle>{t("common:labels.band")} (MHz)</MobileFilterPanelTitle>
        <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">
          {uniqueBandValues.map((band) => {
            const selected = filters.bands.includes(band);
            return (
              <button
                key={band}
                type="button"
                onClick={() => onFiltersChange({ ...filters, bands: toggleValue(filters.bands, band) })}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-2.5 font-mono text-xs transition-colors",
                  selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                )}
              >
                {band === 0 ? t("stations:cells.unknownBand") : band}
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={statusFilterCount > 0} count={statusFilterCount} icon={CheckmarkCircle02Icon} label={t("main:filters.stationStatus")}>
        <StationStatusFilter filters={filters} onToggleStatus={handleToggleStatus} />
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={handleClearFilters}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}

      <div className="inline-flex h-8 max-w-44 shrink-0 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={DatabaseIcon} className="mr-1.5 size-3.5 shrink-0" />
        <span className="truncate">
          {totalStations !== undefined
            ? t("main:filters.showingStationsOfTotal", { count: stationCount, total: totalStations })
            : t("main:filters.showingStations", { count: stationCount })}
        </span>
      </div>
    </div>
  );
}

export function StationsListLayout({ data, onRowClick, getRowHref, headerActions, children }: StationsListLayoutProps) {
  const { t } = useTranslation("stations");
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const navActionTarget = useNavActionTarget();

  const {
    stations,
    operators,
    regions,
    uniqueBandValues,
    totalStations,
    filters,
    setFilters,
    selectedRegions,
    setSelectedRegions,
    clearAllFilters,
    activeFilterCount,
    hasActiveFilters,
    sort,
    setSort,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    isLoading,
    isFetchingNextPage,
    isError,
    refetch,
    hasMore,
    loadMore,
  } = data;

  const handleSort = useCallback(
    (column: StationSortBy) => {
      if (sortBy === column) {
        if (sort === "desc") setSort("asc");
        else {
          setSortBy(undefined);
          setSort("desc");
        }
      } else {
        setSortBy(column);
        setSort("desc");
      }
    },
    [sort, sortBy, setSort, setSortBy],
  );

  const mobileFilterRail = (
    <StationsMobileFilterRail
      filters={filters}
      operators={operators}
      regions={regions}
      uniqueBandValues={uniqueBandValues}
      selectedRegions={selectedRegions}
      searchQuery={searchQuery}
      onFiltersChange={setFilters}
      onRegionsChange={setSelectedRegions}
      onClearAllFilters={clearAllFilters}
      onSearchQueryChange={setSearchQuery}
      hasActiveFilters={hasActiveFilters}
      stationCount={stations.length}
      totalStations={totalStations}
    />
  );
  const usesFloatingNavTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const showFloatingMobileRail = isMobile && usesFloatingNavTarget;
  const showMobileFilterButton = isMobile && navActionTarget !== null && !usesFloatingNavTarget;

  return (
    <>
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        <ResponsiveFilters
          isOpen={mobileFiltersOpen}
          onOpenChange={setMobileFiltersOpen}
          filters={filters}
          operators={operators}
          regions={regions}
          uniqueBandValues={uniqueBandValues}
          selectedRegions={selectedRegions}
          searchQuery={searchQuery}
          onFiltersChange={setFilters}
          onRegionsChange={setSelectedRegions}
          onClearAllFilters={clearAllFilters}
          onSearchQueryChange={setSearchQuery}
          hasActiveFilters={hasActiveFilters}
          stationCount={stations.length}
          totalStations={totalStations}
        />

        <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 min-h-0 overflow-hidden">
          {isMobile && !navActionTarget ? (
            <div className="mb-2 shrink-0 overflow-x-auto overflow-y-hidden md:hidden">
              <div className="w-max">{mobileFilterRail}</div>
            </div>
          ) : null}
          <StationsDataTable
            data={stations}
            isLoading={isLoading}
            isFetchingMore={isFetchingNextPage}
            isError={isError}
            onRetry={refetch}
            onRowClick={onRowClick}
            getRowHref={getRowHref}
            onLoadMore={loadMore}
            hasMore={hasMore}
            totalItems={totalStations ?? stations.length}
            sort={sort}
            sortBy={sortBy}
            onSort={handleSort}
          />
        </div>
      </div>

      {navActionTarget &&
        createPortal(
          <div className={cn("flex items-center gap-2", usesFloatingNavTarget && "max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1")}>
            {showFloatingMobileRail ? (
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                <div className="w-max">{mobileFilterRail}</div>
              </div>
            ) : null}
            {showMobileFilterButton ? (
              <Button variant="outline" size="sm" className="relative md:hidden" onClick={() => setMobileFiltersOpen(true)}>
                <HugeiconsIcon icon={FilterIcon} className="size-4 mr-2" />
                {t("common:labels.filters")}
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            ) : null}
            {headerActions ? (
              <div className={cn("flex shrink-0 items-center", usesFloatingNavTarget && "max-md:border-l max-md:border-border/70 max-md:pl-1")}>
                {headerActions}
              </div>
            ) : null}
          </div>,
          navActionTarget,
        )}

      {children}
    </>
  );
}
