import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useNavActionTarget } from "@/contexts/navActions";
import { UnassignedPermitsDataTable } from "@/features/admin/uke-permits/components/dataTable";
import { UnassignedPermitsResponsiveFilters } from "@/features/admin/uke-permits/components/responsiveFilters";
import { useUnassignedPermitsData } from "@/features/admin/uke-permits/hooks/useUnassignedPermitsData";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { useTablePagination } from "@/hooks/useTablePageSize";
import type { UkeStation } from "@/types/station";

const TABLE_PAGINATION_CONFIG = { rowHeight: 64, headerHeight: 40, paginationHeight: 45 };

function AdminUkePermitsPage() {
  const { t } = useTranslation("admin");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { openUkePermitDialog } = useFloatingDialogStack();
  const navActionTarget = useNavActionTarget();

  const { containerRef, pagination, setPagination, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const data = useUnassignedPermitsData({ pagination, setPagination });

  const {
    stations,
    operators,
    regions,
    totalStations,
    filters,
    setFilters,
    selectedRegions,
    setSelectedRegions,
    clearAllFilters,
    activeFilterCount,
    searchQuery,
    setSearchQuery,
    isLoading,
    isFetching,
  } = data;

  const handleOpenDetails = useCallback((station: UkeStation) => openUkePermitDialog(station), [openUkePermitDialog]);

  const handleViewOnMap = useCallback((station: UkeStation) => {
    if (!station.location) return;
    const url = `${window.location.origin}/#map=16/${station.location.latitude}/${station.location.longitude}~fu~S${station.station_id}`;
    window.open(url, "_blank");
  }, []);

  return (
    <>
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        <UnassignedPermitsResponsiveFilters
          isOpen={mobileFiltersOpen}
          onOpenChange={setMobileFiltersOpen}
          filters={filters}
          operators={operators}
          regions={regions}
          selectedRegions={selectedRegions}
          searchQuery={searchQuery}
          onFiltersChange={setFilters}
          onRegionsChange={setSelectedRegions}
          onClearAllFilters={clearAllFilters}
          onSearchQueryChange={setSearchQuery}
          stationCount={stations.length}
          totalStations={totalStations}
        />

        <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 min-h-0 overflow-hidden">
          <UnassignedPermitsDataTable
            data={stations}
            isLoading={isLoading || isFetching}
            onOpenDetails={handleOpenDetails}
            onViewOnMap={handleViewOnMap}
            totalItems={totalStations}
            containerRef={containerRef}
            pagination={pagination}
            setPagination={setPagination}
            pageSizeOptions={pageSizeOptions}
          />
        </div>
      </div>
      {navActionTarget &&
        createPortal(
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="relative md:hidden" onClick={() => setMobileFiltersOpen(true)}>
              <HugeiconsIcon icon={FilterIcon} className="size-4 mr-2" />
              {t("common:labels.filters")}
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>,
          navActionTarget,
        )}
    </>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/uke-permits")({
  component: AdminUkePermitsPage,
  staticData: {
    titleKey: "breadcrumbs.ukePermits",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", i18nNamespace: "admin" }],
    allowedRoles: ["admin", "editor"],
  },
});
