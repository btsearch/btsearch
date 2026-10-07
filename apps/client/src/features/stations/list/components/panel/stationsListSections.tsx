import { useTranslation } from "react-i18next";

import { DEFAULT_LIST_STATION_STATUSES, isDefaultListStationStatuses } from "../../data/listStationStatuses";
import {
  STATIONS_LIST_MISSING,
  type StationsListFilters,
  type StationsListFiltersChange,
  type StationsListMissing,
  type StationsListVariant,
  applyMapPanelChange,
  toggleStationsListMissing,
  toggleStationsListStatus,
} from "../../data/stationsListFilters";
import type { StationsListPanel } from "../../data/stationsListPanel";
import { ListCountrySection, ListOperatorSection, ListRegionSection, ListStructureSection } from "./listPanelSections";
import { BandSection, RecentDaysFilter, StandardSection, UplinkSection } from "@/features/map/components/search-overlay/mapFilterSections";
import { FacetPill, FilterPanelSection } from "@/features/shared/filterPanel";
import { toV2StationStatus } from "@/features/station-details/station/utils/stations";
import { StationStatusPills } from "@/features/stations/components/stationStatusFilter";
import { toggleValue } from "@/lib/utils";

export type StationsListPanelProps = {
  filters: StationsListFilters;
  onFiltersChange: (change: StationsListFiltersChange) => void;
  variant: StationsListVariant;
};

type StationsListSectionProps = {
  filters: StationsListFilters;
  panel: StationsListPanel;
  isInline?: boolean;
  onFiltersChange: (change: StationsListFiltersChange) => void;
};

const COMMON_STRUCTURE_TYPE_COUNT = 4;

export function StationsCountrySection({ panel, isInline, onFiltersChange }: StationsListSectionProps) {
  return (
    <ListCountrySection
      countries={panel.countries}
      isInline={isInline}
      onPickCountries={(countryCodes) => onFiltersChange((current) => panel.pickCountries(current, countryCodes))}
    />
  );
}

export function StationsOperatorSection({ panel, onFiltersChange }: StationsListSectionProps) {
  return (
    <ListOperatorSection
      panel={panel}
      onToggleOperator={(operatorId) => onFiltersChange((current) => ({ ...current, operatorIds: toggleValue(current.operatorIds, operatorId) }))}
      onMapFiltersChange={(update) => onFiltersChange((current) => applyMapPanelChange(current, update))}
    />
  );
}

export function StationsRegionSection({ filters, panel, isInline, onFiltersChange }: StationsListSectionProps) {
  return (
    <ListRegionSection
      regionGroups={panel.regionGroups}
      regionIds={filters.regionIds}
      isInline={isInline}
      onRegionIdsChange={(regionIds) => onFiltersChange((current) => ({ ...current, regionIds }))}
    />
  );
}

export function StationsStandardSection({ panel, onFiltersChange }: StationsListSectionProps) {
  return (
    <StandardSection
      filters={panel.mapFilters}
      onToggleRat={(rat) => onFiltersChange((current) => ({ ...current, rats: toggleValue(current.rats, rat) }))}
      onClearAllRats={() => onFiltersChange((current) => ({ ...current, rats: [] }))}
      hasKeyHint={false}
    />
  );
}

export function StationsBandSection({ panel, onFiltersChange }: StationsListSectionProps) {
  return (
    <BandSection
      filters={panel.mapFilters}
      facetCountryCodes={panel.countries.inPlay}
      lookups={panel.lookups}
      onToggleBand={(label) => onFiltersChange((current) => ({ ...current, bands: toggleValue(current.bands, label) }))}
      onClearAllBands={() => onFiltersChange((current) => ({ ...current, bands: [] }))}
    />
  );
}

export function StationsStatusSection({ filters, panel, onFiltersChange }: StationsListSectionProps) {
  const { t } = useTranslation("main");

  return (
    <FilterPanelSection
      title={t("filters.stationStatus")}
      onClear={
        isDefaultListStationStatuses(filters.statuses)
          ? undefined
          : () => onFiltersChange((current) => ({ ...current, statuses: [...DEFAULT_LIST_STATION_STATUSES] }))
      }
    >
      <StationStatusPills
        statuses={panel.mapFilters.status}
        onToggleStatus={(status) => onFiltersChange((current) => toggleStationsListStatus(current, toV2StationStatus(status)))}
      />
    </FilterPanelSection>
  );
}

export function StationsStructureSection({ filters, onFiltersChange }: StationsListSectionProps) {
  return (
    <ListStructureSection
      structureTypes={filters.structureTypes}
      commonTypeCount={COMMON_STRUCTURE_TYPE_COUNT}
      onToggleStructureType={(type) => onFiltersChange((current) => ({ ...current, structureTypes: toggleValue(current.structureTypes, type) }))}
      onClear={() => onFiltersChange((current) => ({ ...current, structureTypes: [] }))}
    />
  );
}

export function StationsUplinkSection({ panel, onFiltersChange }: StationsListSectionProps) {
  return (
    <UplinkSection filters={panel.mapFilters} onFiltersChange={(update) => onFiltersChange((current) => applyMapPanelChange(current, update))} />
  );
}

export function StationsRecentSection({ filters, panel, onFiltersChange }: StationsListSectionProps) {
  const { t } = useTranslation("main");

  return (
    <FilterPanelSection
      title={t("filters.newOnly")}
      onClear={filters.recentDays === null ? undefined : () => onFiltersChange((current) => ({ ...current, recentDays: null }))}
    >
      <RecentDaysFilter
        filters={panel.mapFilters}
        onRecentDaysChange={(recentDays) => onFiltersChange((current) => ({ ...current, recentDays }))}
        onRecentDateFieldChange={(recentDateFields) => onFiltersChange((current) => ({ ...current, recentDateFields }))}
      />
    </FilterPanelSection>
  );
}

export function StationsMissingSection({ filters, onFiltersChange }: StationsListSectionProps) {
  const { t } = useTranslation(["main", "statistics"]);
  const labels: Record<StationsListMissing, string> = {
    photos: t("main:filters.withoutPhotos"),
    sectors: t("statistics:completeness.withoutSectors"),
    structure: t("main:filters.withoutStructure"),
    unconfirmed: t("main:filters.unconfirmed"),
  };

  return (
    <FilterPanelSection
      title={t("main:filters.missingData")}
      onClear={filters.missing.length > 0 ? () => onFiltersChange((current) => ({ ...current, missing: [] })) : undefined}
    >
      <div className="flex flex-wrap gap-1.5">
        {STATIONS_LIST_MISSING.map((missing) => (
          <FacetPill
            key={missing}
            active={filters.missing.includes(missing)}
            onClick={() => onFiltersChange((current) => toggleStationsListMissing(current, missing))}
          >
            {labels[missing]}
          </FacetPill>
        ))}
      </div>
    </FilterPanelSection>
  );
}
