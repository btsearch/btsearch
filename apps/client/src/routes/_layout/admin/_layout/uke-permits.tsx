import { Cancel01Icon, FilterIcon, Location01Icon, Search02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button } from "@/components/ui/button";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { useNavActionTarget } from "@/contexts/navActions";
import { UnassignedPermitsDataTable } from "@/features/admin/uke-permits/components/dataTable";
import { UnassignedPermitsResponsiveFilters } from "@/features/admin/uke-permits/components/responsiveFilters";
import { type UnassignedPermitsFilters, useUnassignedPermitsData } from "@/features/admin/uke-permits/hooks/useUnassignedPermitsData";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator, Region, UkeStation } from "@/types/station";

const TABLE_PAGINATION_CONFIG = { rowHeight: 64, headerHeight: 40, paginationHeight: 45 };

type UkePermitsMobileFilterRailProps = {
  filters: UnassignedPermitsFilters;
  operators: Operator[];
  regions: Region[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (filters: UnassignedPermitsFilters) => void;
  onRegionsChange: (regionIds: number[]) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  stationCount: number;
  totalStations?: number;
};

function UkePermitsMobileFilterRail({
  filters,
  operators,
  regions,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  stationCount,
  totalStations,
}: UkePermitsMobileFilterRailProps) {
  const { t } = useTranslation(["admin", "common"]);
  const topOperators = useMemo(
    () => operators.filter((op) => TOP4_MNCS.includes(op.mnc)).sort((a, b) => TOP4_MNCS.indexOf(a.mnc) - TOP4_MNCS.indexOf(b.mnc)),
    [operators],
  );
  const otherOperators = useMemo(() => operators.filter((op) => !TOP4_MNCS.includes(op.mnc)), [operators]);
  const selectedRegionNames = useMemo(
    () => selectedRegions.map((id) => regions.find((region) => region.id === id)?.name).filter((name): name is string => Boolean(name)),
    [regions, selectedRegions],
  );
  const hasSearch = searchQuery.trim().length > 0;
  const hasActiveFilters = filters.operators.length > 0 || selectedRegions.length > 0 || hasSearch;

  const handleClearAll = () => {
    onClearAllFilters();
    onSearchQueryChange("");
  };

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearch} icon={Search02Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search02Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            placeholder={t("common:placeholder.search")}
            className="h-9 w-full rounded-md border bg-background py-2 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={filters.operators.length > 0} count={filters.operators.length} icon={FilterIcon} label={t("common:labels.operator")}>
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
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

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={handleClearAll}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}

      <div className="inline-flex h-8 max-w-44 shrink-0 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={Location01Icon} className="mr-1.5 size-3.5 shrink-0" />
        <span className="truncate">
          {totalStations !== undefined
            ? t("ukePermits.showingStationsOfTotal", { count: stationCount, total: totalStations })
            : t("ukePermits.showingStations", { count: stationCount })}
        </span>
      </div>
    </div>
  );
}

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
      {navActionTarget
        ? createPortal(
            <div
              className={cn(
                "flex items-center gap-2",
                navActionTarget.id === FLOATING_NAV_ACTION_TARGET_ID && "max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1 md:hidden",
              )}
            >
              {navActionTarget.id === FLOATING_NAV_ACTION_TARGET_ID ? (
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                  <div className="w-max">
                    <UkePermitsMobileFilterRail
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
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="relative md:hidden" onClick={() => setMobileFiltersOpen(true)}>
                  <HugeiconsIcon icon={FilterIcon} className="size-4 mr-2" />
                  {t("common:labels.filters")}
                  {activeFilterCount > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              )}
            </div>,
            navActionTarget,
          )
        : null}
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
