import { type ReactNode, useCallback } from "react";
import { createPortal } from "react-dom";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { useNavActionTarget } from "@/contexts/navActions";
import { MobileFilterRailInline } from "@/features/shared/filterPanel";
import { StationsDataTable } from "@/features/stations/components/stationsDataTable";
import type { useStationsData } from "@/features/stations/hooks/useStationsData";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import type { Station, StationSortBy } from "@/types/station";

import { StationsFilterPanel } from "./stationsFilterPanel";
import { StationsMobileFilterRail } from "./stationsMobileFilterRail";

interface StationsListLayoutProps {
  data: ReturnType<typeof useStationsData>;
  onRowClick: (station: Station) => void;
  getRowHref?: (station: Station) => string;
  resultsHeader?: ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
}

export function StationsListLayout({ data, onRowClick, getRowHref, resultsHeader, headerActions, children }: StationsListLayoutProps) {
  const isMobile = useIsMobile();
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

  const filterControlProps = {
    filters,
    operators,
    regions,
    uniqueBandValues,
    selectedRegions,
    searchQuery,
    onFiltersChange: setFilters,
    onRegionsChange: setSelectedRegions,
    onClearAllFilters: clearAllFilters,
    onSearchQueryChange: setSearchQuery,
  };
  const usesFloatingNavTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const showFloatingMobileRail = isMobile && usesFloatingNavTarget;
  const mobileFilterRail = isMobile ? (
    <StationsMobileFilterRail
      {...filterControlProps}
      hasActiveFilters={hasActiveFilters}
      stationCount={stations.length}
      totalStations={totalStations}
    />
  ) : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {!isMobile ? (
          <StationsFilterPanel
            {...filterControlProps}
            activeFilterCount={activeFilterCount}
            stationCount={stations.length}
            totalStations={totalStations}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3">
          {resultsHeader}
          {isMobile && !usesFloatingNavTarget ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}
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

      {navActionTarget && (showFloatingMobileRail || headerActions)
        ? createPortal(
            <div className={cn("flex items-center gap-2", usesFloatingNavTarget && "max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1")}>
              {showFloatingMobileRail ? (
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                  <div className="w-max">{mobileFilterRail}</div>
                </div>
              ) : null}
              {headerActions ? (
                <div className={cn("flex shrink-0 items-center", usesFloatingNavTarget && "max-md:border-l max-md:border-border/70 max-md:pl-1")}>
                  {headerActions}
                </div>
              ) : null}
            </div>,
            navActionTarget,
          )
        : null}

      {children}
    </>
  );
}
