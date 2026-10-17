import type { OfficialLayer } from "@openbts/shared/contract";

import { type MapFilters, listShownOfficialLayers } from "../data/mapFilters";
import { MapAttribution } from "@/components/ui/map";
import { useOfficialSourcesOnScreen } from "@/features/official/queries";
import { listOfficialAttributions } from "@/features/official/sources";

type OfficialAttributionProps = {
  filters: Pick<MapFilters, "source" | "showStations" | "showHeatmap" | "showRadiolines">;
  countryCodes: readonly string[];
};

type SourcesAttributionProps = {
  layers: readonly OfficialLayer[];
  countryCodes: readonly string[];
};

function SourcesAttribution({ layers, countryCodes }: SourcesAttributionProps) {
  const sourcesOnScreen = useOfficialSourcesOnScreen(countryCodes);
  return <MapAttribution texts={listOfficialAttributions(sourcesOnScreen, layers)} />;
}

export function OfficialAttribution({ filters, countryCodes }: OfficialAttributionProps) {
  const layers = listShownOfficialLayers(filters);
  return layers.length > 0 ? <SourcesAttribution layers={layers} countryCodes={countryCodes} /> : null;
}
