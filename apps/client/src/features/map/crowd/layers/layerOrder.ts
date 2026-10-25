import type { Map as MapLibreMap } from "maplibre-gl";

import { ESTIMATED_SITES_LAYER_ID, ESTIMATED_SITE_AREA_FILL_LAYER_ID, POINT_LAYER_ID } from "../../constants";

export type CrowdLayerLevel = "squares" | "marks" | "rings";

export type LayerPlacement = { level: CrowdLayerLevel } | { order: readonly string[] };

const LAYERS_ABOVE: Record<CrowdLayerLevel, readonly string[]> = {
  squares: [ESTIMATED_SITE_AREA_FILL_LAYER_ID, ESTIMATED_SITES_LAYER_ID, POINT_LAYER_ID],
  marks: [ESTIMATED_SITES_LAYER_ID, POINT_LAYER_ID],
  rings: [POINT_LAYER_ID],
};

function listLayersAbove(layerId: string, placement: LayerPlacement): readonly string[] {
  if ("level" in placement) return LAYERS_ABOVE[placement.level];
  return placement.order.slice(placement.order.indexOf(layerId) + 1);
}

export function findLayerAbove(map: MapLibreMap, layerId: string, placement: LayerPlacement): string | undefined {
  return listLayersAbove(layerId, placement).find((aboveId) => map.getLayer(aboveId) !== undefined);
}
