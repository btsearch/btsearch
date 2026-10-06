import { AirportTowerIcon, Building03Icon, ElectricTower01Icon, FilterIcon, Globe02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { clearLocationsListFilters } from "../../data/locationsListFilters";
import { useLocationsListPanel } from "../../data/locationsListPanel";
import {
  LocationsCountrySection,
  type LocationsListPanelProps,
  LocationsOperatorSection,
  LocationsOwnerSection,
  LocationsRegionSection,
  LocationsStationsSection,
  LocationsStructureSection,
} from "./locationsListSections";
import { ListMobileFilterChip, ListMobileFilterRail, useHeldClearChip } from "@/features/stations/list/components/panel/listMobileFilterRail";
import { hasSameListPanelProps } from "@/features/stations/list/components/panel/listPanelSections";

export const LocationsListMobileFilters = memo(function LocationsListMobileFilters({ filters, onFiltersChange }: LocationsListPanelProps) {
  const { t } = useTranslation(["main", "common", "stationDetails"]);
  const panel = useLocationsListPanel(filters);
  const { isClearChipShown, handleChipOpenChange } = useHeldClearChip(panel.activeFilterCount > 0);
  const sectionProps = { filters, panel, onFiltersChange, isInline: true };

  return (
    <ListMobileFilterRail isClearChipShown={isClearChipShown} onClearFilters={() => onFiltersChange(clearLocationsListFilters)}>
      {panel.countries.hasCountrySection ? (
        <ListMobileFilterChip
          icon={Globe02Icon}
          label={t("main:filters.country")}
          count={panel.countries.picked.length}
          onOpenChange={handleChipOpenChange}
        >
          <LocationsCountrySection {...sectionProps} />
        </ListMobileFilterChip>
      ) : null}
      <ListMobileFilterChip
        icon={FilterIcon}
        label={t("common:labels.operator")}
        count={filters.operatorIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <LocationsOperatorSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={Location01Icon}
        label={t("stationDetails:specs.region")}
        count={filters.regionIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <LocationsRegionSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={ElectricTower01Icon}
        label={t("common:structure.type")}
        count={filters.structureTypes.length}
        onOpenChange={handleChipOpenChange}
      >
        <LocationsStructureSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={Building03Icon}
        label={t("common:structure.owner")}
        count={filters.structureOwnerIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <LocationsOwnerSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={AirportTowerIcon}
        label={t("common:labels.stations")}
        count={filters.isWithoutStations ? 1 : 0}
        onOpenChange={handleChipOpenChange}
      >
        <LocationsStationsSection {...sectionProps} />
      </ListMobileFilterChip>
    </ListMobileFilterRail>
  );
}, hasSameListPanelProps);
