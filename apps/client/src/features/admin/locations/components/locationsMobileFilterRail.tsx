import { Cancel01Icon, Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { MobileOperatorFilterChip, MobileRegionFilterChip } from "@/features/shared/filterPanel";
import { toggleValue } from "@/lib/utils";

import type { LocationsFilterControlProps } from "./locationsFilterPanel";

type LocationsMobileFilterRailProps = LocationsFilterControlProps & {
  hasActiveFilters: boolean;
};

export function LocationsMobileFilterRail({
  filters,
  operators,
  regions,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  hasActiveFilters,
  locationCount,
  totalLocations,
}: LocationsMobileFilterRailProps) {
  const { t } = useTranslation(["admin", "common", "main"]);
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label={t("common:labels.filters")}>
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            placeholder={t("admin:locations.searchPlaceholder")}
            autoComplete="off"
            aria-label={t("common:labels.search")}
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

      <MobileOperatorFilterChip
        operators={operators}
        selectedMncs={filters.operators}
        onToggle={(mnc) => onFiltersChange((current) => ({ ...current, operators: toggleValue(current.operators, mnc) }))}
      />

      <MobileRegionFilterChip
        regions={regions}
        selectedRegions={selectedRegions}
        onToggle={(regionId) => onRegionsChange((current) => toggleValue(current, regionId))}
      />

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClearAllFilters}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}

      <div className="inline-flex h-8 max-w-44 shrink-0 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={Location01Icon} className="mr-1.5 size-3.5 shrink-0" />
        <span className="truncate">
          {totalLocations !== undefined
            ? t("main:filters.showingLocationsOfTotal", { count: locationCount, total: totalLocations })
            : t("main:filters.showingLocations", { count: locationCount })}
        </span>
      </div>
    </div>
  );
}
