import {
  Alert02Icon,
  CableIcon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  ElectricTower01Icon,
  FilterIcon,
  FullSignalIcon,
  Globe02Icon,
  Location01Icon,
  Radar01Icon,
} from "@hugeicons/core-free-icons";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { isDefaultListStationStatuses } from "../../data/listStationStatuses";
import { clearStationsListFilters } from "../../data/stationsListFilters";
import { useStationsListPanel } from "../../data/stationsListPanel";
import { ListMobileFilterChip, ListMobileFilterRail, useHeldClearChip } from "./listMobileFilterRail";
import { hasSameListPanelProps } from "./listPanelSections";
import {
  StationsBandSection,
  StationsCountrySection,
  type StationsListPanelProps,
  StationsMissingSection,
  StationsOperatorSection,
  StationsRecentSection,
  StationsRegionSection,
  StationsStandardSection,
  StationsStatusSection,
  StationsStructureSection,
  StationsUplinkSection,
} from "./stationsListSections";

const UPLINK_LABEL = "Uplink";

export const StationsListMobileFilters = memo(function StationsListMobileFilters({ filters, onFiltersChange, variant }: StationsListPanelProps) {
  const { t } = useTranslation(["main", "common", "stationDetails"]);
  const panel = useStationsListPanel(filters, variant);
  const { isClearChipShown, handleChipOpenChange } = useHeldClearChip(panel.activeFilterCount > 0);
  const sectionProps = { filters, panel, onFiltersChange, isInline: true };
  const statusCount = isDefaultListStationStatuses(filters.statuses) ? 0 : filters.statuses.length;

  return (
    <ListMobileFilterRail isClearChipShown={isClearChipShown} onClearFilters={() => onFiltersChange(clearStationsListFilters)}>
      {panel.countries.hasCountrySection ? (
        <ListMobileFilterChip
          icon={Globe02Icon}
          label={t("main:filters.country")}
          count={panel.countries.picked.length}
          onOpenChange={handleChipOpenChange}
        >
          <StationsCountrySection {...sectionProps} />
        </ListMobileFilterChip>
      ) : null}
      <ListMobileFilterChip
        icon={FilterIcon}
        label={t("common:labels.operator")}
        count={filters.operatorIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <StationsOperatorSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={Location01Icon}
        label={t("stationDetails:specs.region")}
        count={filters.regionIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <StationsRegionSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={FullSignalIcon} label={t("common:labels.standard")} count={filters.rats.length} onOpenChange={handleChipOpenChange}>
        <StationsStandardSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={Radar01Icon} label={t("common:labels.band")} count={filters.bands.length} onOpenChange={handleChipOpenChange}>
        <StationsBandSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={CheckmarkCircle02Icon}
        label={t("main:filters.stationStatus")}
        count={statusCount}
        onOpenChange={handleChipOpenChange}
      >
        <StationsStatusSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={ElectricTower01Icon}
        label={t("common:structure.type")}
        count={filters.structureTypes.length}
        onOpenChange={handleChipOpenChange}
      >
        <StationsStructureSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={CableIcon} label={UPLINK_LABEL} count={filters.uplinkTypes.length} onOpenChange={handleChipOpenChange}>
        <StationsUplinkSection {...sectionProps} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={Calendar03Icon}
        label={t("main:filters.newOnly")}
        count={filters.recentDays === null ? 0 : 1}
        onOpenChange={handleChipOpenChange}
      >
        <StationsRecentSection {...sectionProps} />
      </ListMobileFilterChip>
      {variant === "admin" ? (
        <ListMobileFilterChip
          icon={Alert02Icon}
          label={t("main:filters.missingData")}
          count={filters.missing.length}
          onOpenChange={handleChipOpenChange}
        >
          <StationsMissingSection {...sectionProps} />
        </ListMobileFilterChip>
      ) : null}
    </ListMobileFilterRail>
  );
}, hasSameListPanelProps);
