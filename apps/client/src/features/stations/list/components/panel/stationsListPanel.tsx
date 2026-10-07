import { memo } from "react";

import { useStationsListPanel } from "../../data/stationsListPanel";
import { ListPanelSlot, hasSameListPanelProps } from "./listPanelSections";
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

export const StationsListPanel = memo(function StationsListPanel({ filters, onFiltersChange, variant }: StationsListPanelProps) {
  const panel = useStationsListPanel(filters, variant);
  const sectionProps = { filters, panel, onFiltersChange };

  return (
    <>
      <ListPanelSlot isShown={panel.countries.hasCountrySection}>
        <StationsCountrySection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsOperatorSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsRegionSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsStandardSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsBandSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsStatusSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsStructureSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsUplinkSection {...sectionProps} />
      </ListPanelSlot>
      <ListPanelSlot>
        <StationsRecentSection {...sectionProps} />
      </ListPanelSlot>
      {variant === "admin" ? (
        <ListPanelSlot>
          <StationsMissingSection {...sectionProps} />
        </ListPanelSlot>
      ) : null}
    </>
  );
}, hasSameListPanelProps);
