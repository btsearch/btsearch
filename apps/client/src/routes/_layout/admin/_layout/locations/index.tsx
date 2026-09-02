import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { createPortal } from "react-dom";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { useNavActionTarget } from "@/contexts/navActions";
import { LocationsDataTable } from "@/features/admin/locations/components/locationsDataTable";
import { LocationsFilterPanel } from "@/features/admin/locations/components/locationsFilterPanel";
import { LocationsMobileFilterRail } from "@/features/admin/locations/components/locationsMobileFilterRail";
import { useLocationsData } from "@/features/admin/locations/hooks/useLocationsData";
import { MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useIsMobile } from "@/hooks/useMobile";
import type { LocationSortBy, LocationWithStations } from "@/types/station";

function AdminLocationsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();

  const {
    locations,
    operators,
    regions,
    totalLocations,
    filters,
    setFilters,
    selectedRegions,
    setSelectedRegions,
    clearAllFilters,
    activeFilterCount,
    hasActiveFilters,
    searchQuery,
    setSearchQuery,
    sort,
    sortBy,
    setSort,
    setSortBy,
    isLoading,
    isFetchingNextPage,
    isError,
    refetch,
    hasMore,
    loadMore,
  } = useLocationsData();

  const handleSort = useCallback(
    (column: LocationSortBy) => {
      if (sortBy === column) {
        setSort((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSort("desc");
      }
    },
    [sortBy, setSort, setSortBy],
  );

  const handleRowClick = useCallback((location: LocationWithStations) => navigate({ to: `/admin/locations/${location.id}` }), [navigate]);
  const getRowHref = useCallback((location: LocationWithStations) => `/admin/locations/${location.id}`, []);

  const filterControlProps = {
    filters,
    operators,
    regions,
    selectedRegions,
    searchQuery,
    onFiltersChange: setFilters,
    onRegionsChange: setSelectedRegions,
    onClearAllFilters: clearAllFilters,
    onSearchQueryChange: setSearchQuery,
    locationCount: locations.length,
    totalLocations,
  };
  const usesFloatingNavTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const showFloatingMobileRail = isMobile && usesFloatingNavTarget;
  const mobileFilterRail = isMobile ? <LocationsMobileFilterRail {...filterControlProps} hasActiveFilters={hasActiveFilters} /> : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {!isMobile ? <LocationsFilterPanel {...filterControlProps} activeFilterCount={activeFilterCount} /> : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3">
          {isMobile && !usesFloatingNavTarget ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}
          <LocationsDataTable
            data={locations}
            isLoading={isLoading}
            isFetchingMore={isFetchingNextPage}
            isError={isError}
            onRetry={refetch}
            onRowClick={handleRowClick}
            getRowHref={getRowHref}
            onLoadMore={loadMore}
            hasMore={hasMore}
            totalItems={totalLocations ?? locations.length}
            sort={sort}
            sortBy={sortBy}
            onSort={handleSort}
          />
        </div>
      </div>

      {showFloatingMobileRail && navActionTarget
        ? createPortal(
            <div className="flex items-center max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1 md:hidden">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="w-max">{mobileFilterRail}</div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}
    </>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/locations/")({
  component: AdminLocationsPage,
  staticData: {
    titleKey: "breadcrumbs.locations",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", i18nNamespace: "admin" }],
    allowedRoles: ["admin", "editor"],
  },
});
