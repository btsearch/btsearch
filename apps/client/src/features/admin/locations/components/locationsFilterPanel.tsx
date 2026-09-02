import { useTranslation } from "react-i18next";

import {
  FilterPanelFooter,
  FilterPanelHeader,
  FilterPanelSection,
  FilterPanelShell,
  FilterSearchInput,
  FilterSearchShell,
  OperatorCheckboxGrid,
  RegionCombobox,
} from "@/features/shared/filterPanel";
import { toggleValue } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

import type { LocationFilters } from "../hooks/useLocationsData";

export type LocationsFilterControlProps = {
  filters: LocationFilters;
  operators: Operator[];
  regions: Region[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (update: LocationFilters | ((current: LocationFilters) => LocationFilters)) => void;
  onRegionsChange: (update: number[] | ((current: number[]) => number[])) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  locationCount: number;
  totalLocations?: number;
};

type LocationsFilterPanelProps = LocationsFilterControlProps & { activeFilterCount: number };

export function LocationsFilterPanel({
  filters,
  operators,
  regions,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  activeFilterCount,
  locationCount,
  totalLocations,
}: LocationsFilterPanelProps) {
  const { t } = useTranslation(["admin", "common", "main"]);

  const toggleOperator = (mnc: number) => onFiltersChange((current) => ({ ...current, operators: toggleValue(current.operators, mnc) }));

  return (
    <FilterPanelShell
      search={
        <FilterSearchShell hasValue={searchQuery.length > 0} onClear={() => onSearchQueryChange("")}>
          <FilterSearchInput
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            placeholder={t("admin:locations.searchPlaceholder")}
            aria-label={t("common:labels.search")}
          />
        </FilterSearchShell>
      }
    >
      <FilterPanelHeader activeFilterCount={activeFilterCount} onClearAll={onClearAllFilters} />

      <FilterPanelSection
        title={t("common:labels.operator")}
        onClear={filters.operators.length > 0 ? () => onFiltersChange((current) => ({ ...current, operators: [] })) : undefined}
      >
        <OperatorCheckboxGrid operators={operators} selectedMncs={filters.operators} onToggle={toggleOperator} />
      </FilterPanelSection>

      <FilterPanelSection title={t("common:labels.region")} onClear={selectedRegions.length > 0 ? () => onRegionsChange([]) : undefined}>
        <RegionCombobox regions={regions} selectedRegions={selectedRegions} onChange={onRegionsChange} />
      </FilterPanelSection>

      <FilterPanelFooter>
        {totalLocations !== undefined
          ? t("main:filters.showingLocationsOfTotal", { count: locationCount, total: totalLocations })
          : t("main:filters.showingLocations", { count: locationCount })}
      </FilterPanelFooter>
    </FilterPanelShell>
  );
}
