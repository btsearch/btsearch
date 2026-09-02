import { useTranslation } from "react-i18next";

import { RAT_OPTIONS } from "@/features/map/constants";
import {
  FacetPill,
  FilterPanelFooter,
  FilterPanelHeader,
  FilterPanelSection,
  FilterPanelShell,
  OperatorCheckboxGrid,
  RegionCombobox,
  sortBandsUnknownLast,
} from "@/features/shared/filterPanel";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { toggleValue } from "@/lib/utils";
import type { StationFilters, StationStatus } from "@/types/station";

import { DEFAULT_STATIONS_LIST_STATUSES, getStationStatusFilterCount, toggleStationStatusSelection } from "../stationStatus";
import type { StationsFilterControlProps } from "./stationFilterOptions";
import { StationsSearchControl } from "./stationsSearchControl";
import { StationStatusPills } from "./stationStatusFilter";

type StationsFilterPanelProps = StationsFilterControlProps & {
  activeFilterCount: number;
  stationCount: number;
  totalStations?: number;
};

export function StationsFilterPanel({
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
  activeFilterCount,
  stationCount,
  totalStations,
}: StationsFilterPanelProps) {
  const { t } = useTranslation(["stations", "common", "main"]);

  const patchFilters = (patch: Partial<StationFilters>) => onFiltersChange((current) => ({ ...current, ...patch }));
  const toggleOperator = (mnc: number) => onFiltersChange((current) => ({ ...current, operators: toggleValue(current.operators, mnc) }));
  const toggleStatus = (status: StationStatus) =>
    onFiltersChange((current) => ({ ...current, status: toggleStationStatusSelection(current.status, status) }));

  return (
    <FilterPanelShell
      search={
        <StationsSearchControl
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          placeholder={t("stations:database.searchPlaceholder")}
        />
      }
    >
      <FilterPanelHeader activeFilterCount={activeFilterCount} onClearAll={onClearAllFilters} />

      <FilterPanelSection
        title={t("common:labels.operator")}
        onClear={filters.operators.length > 0 ? () => patchFilters({ operators: [] }) : undefined}
      >
        <OperatorCheckboxGrid operators={operators} selectedMncs={filters.operators} onToggle={toggleOperator} />
      </FilterPanelSection>

      <FilterPanelSection title={t("common:labels.region")} onClear={selectedRegions.length > 0 ? () => onRegionsChange([]) : undefined}>
        <RegionCombobox regions={regions} selectedRegions={selectedRegions} onChange={onRegionsChange} />
      </FilterPanelSection>

      <FilterPanelSection title={t("common:labels.standard")} onClear={filters.rat.length > 0 ? () => patchFilters({ rat: [] }) : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {RAT_OPTIONS.map((rat) => {
            const active = filters.rat.includes(rat.value);
            return (
              <FacetPill
                key={rat.value}
                active={active}
                onClick={() => onFiltersChange((current) => ({ ...current, rat: toggleValue(current.rat, rat.value) }))}
                className="pl-1.5"
              >
                <GenerationTag active={active}>{rat.gen}</GenerationTag>
                <span>{rat.label}</span>
              </FacetPill>
            );
          })}
        </div>
      </FilterPanelSection>

      <FilterPanelSection
        title={`${t("common:labels.band")} (MHz)`}
        onClear={filters.bands.length > 0 ? () => patchFilters({ bands: [] }) : undefined}
      >
        <div className="flex flex-wrap gap-1.5">
          {sortBandsUnknownLast(uniqueBandValues).map((band) => (
            <FacetPill
              key={band}
              active={filters.bands.includes(band)}
              onClick={() => onFiltersChange((current) => ({ ...current, bands: toggleValue(current.bands, band) }))}
              className="font-mono tabular-nums"
            >
              {band === 0 ? t("stations:cells.unknownBand") : band}
            </FacetPill>
          ))}
        </div>
      </FilterPanelSection>

      <FilterPanelSection
        title={t("main:filters.stationStatus")}
        onClear={getStationStatusFilterCount(filters.status) > 0 ? () => patchFilters({ status: [...DEFAULT_STATIONS_LIST_STATUSES] }) : undefined}
      >
        <StationStatusPills statuses={filters.status} onToggleStatus={toggleStatus} />
      </FilterPanelSection>

      <FilterPanelFooter>
        {totalStations !== undefined
          ? t("main:filters.showingStationsOfTotal", { count: stationCount, total: totalStations })
          : t("main:filters.showingStations", { count: stationCount })}
      </FilterPanelFooter>
    </FilterPanelShell>
  );
}
