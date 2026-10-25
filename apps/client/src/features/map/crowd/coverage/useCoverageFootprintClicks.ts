import type { MapGeoJSONFeature, MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";

import {
  COVERAGE_FOOTPRINT_FILL_LAYER_ID,
  ESTIMATED_SITES_LAYER_ID,
  MICROWAVE_LINKS_ENDPOINT_LAYER_ID,
  MICROWAVE_LINKS_HITBOX_LAYER_ID,
  PLANNED_PEM_LAYER_ID,
  POINT_LAYER_ID,
} from "../../constants";
import { chooseMeasuredCoverageCell } from "./coverageStore";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";

type UseCoverageFootprintClicksArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  isPickable: boolean;
};

const MARKER_LAYER_IDS = [
  POINT_LAYER_ID,
  `${POINT_LAYER_ID}-symbol`,
  ESTIMATED_SITES_LAYER_ID,
  MICROWAVE_LINKS_HITBOX_LAYER_ID,
  MICROWAVE_LINKS_ENDPOINT_LAYER_ID,
  PLANNED_PEM_LAYER_ID,
];

function hasMarkerUnder(map: MapLibreMap, event: MapLayerMouseEvent): boolean {
  const layers = MARKER_LAYER_IDS.filter((layerId) => map.getLayer(layerId) !== undefined);
  return layers.length > 0 && map.queryRenderedFeatures(event.point, { layers }).length > 0;
}

function findSmallestCellId(features: readonly MapGeoJSONFeature[]): number | null {
  let smallest: { cellId: number; area: number } | null = null;
  for (const feature of features) {
    const { observedCellId, area } = feature.properties;
    if (typeof observedCellId !== "number" || typeof area !== "number") continue;
    if (smallest === null || area < smallest.area) smallest = { cellId: observedCellId, area };
  }
  return smallest?.cellId ?? null;
}

export function useCoverageFootprintClicks({ map, isLoaded, isPickable }: UseCoverageFootprintClicksArgs): void {
  const chooseClickedCell = useEffectEvent((target: MapLibreMap, event: MapLayerMouseEvent) => {
    if (hasMarkerUnder(target, event)) return;
    const cellId = findSmallestCellId(event.features ?? []);
    if (cellId !== null) chooseMeasuredCoverageCell(cellId);
  });

  useEffect(() => {
    if (!map || !isLoaded || !isPickable) return;
    const usesHover = hasReliableHoverPointer();
    const handleClick = (event: MapLayerMouseEvent) => chooseClickedCell(map, event);
    const handleMouseMove = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = (event: MapLayerMouseEvent) => {
      if (!hasMarkerUnder(map, event)) map.getCanvas().style.cursor = "";
    };

    map.on("click", COVERAGE_FOOTPRINT_FILL_LAYER_ID, handleClick);
    if (usesHover) {
      map.on("mousemove", COVERAGE_FOOTPRINT_FILL_LAYER_ID, handleMouseMove);
      map.on("mouseleave", COVERAGE_FOOTPRINT_FILL_LAYER_ID, handleMouseLeave);
    }
    return () => {
      map.off("click", COVERAGE_FOOTPRINT_FILL_LAYER_ID, handleClick);
      if (!usesHover) return;
      map.off("mousemove", COVERAGE_FOOTPRINT_FILL_LAYER_ID, handleMouseMove);
      map.off("mouseleave", COVERAGE_FOOTPRINT_FILL_LAYER_ID, handleMouseLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [map, isLoaded, isPickable]);
}
