import { memo } from "react";

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
import { ListPanelSlot, hasSameListPanelProps } from "@/features/stations/list/components/panel/listPanelSections";

export const LocationsListPanel = memo(function LocationsListPanel({ filters, onFiltersChange }: LocationsListPanelProps) {
  const panel = useLocationsListPanel(filters);
  const sectionProps = { filters, panel, onFiltersChange };

  return (
    <>
      <ListPanelSlot isShown={panel.countries.hasCountrySection}>
        <LocationsCountrySection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <LocationsOperatorSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <LocationsRegionSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <LocationsStructureSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <LocationsOwnerSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <LocationsStationsSection {...sectionProps} />
      </ListPanelSlot>
    </>
  );
}, hasSameListPanelProps);
