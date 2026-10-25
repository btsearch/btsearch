import type { Map as MapLibreMap } from "maplibre-gl";

export type FadedLayer = { id: string; property: "fill-opacity" | "line-opacity" | "icon-opacity"; opacity: number };

const LAYER_FADE_MS = 300;
const removalTimers = new WeakMap<MapLibreMap, Map<string, number>>();

export const LAYER_FADE = { duration: LAYER_FADE_MS, delay: 0 };

export function setFadedLayersShown(map: MapLibreMap, layers: readonly FadedLayer[], isShown: boolean): void {
  for (const layer of layers) {
    if (map.getLayer(layer.id)) map.setPaintProperty(layer.id, layer.property, isShown ? layer.opacity : 0);
  }
}

export function cancelLayerRemoval(map: MapLibreMap, sourceIds: readonly string[]): void {
  const timers = removalTimers.get(map);
  if (timers === undefined) return;
  for (const sourceId of sourceIds) {
    window.clearTimeout(timers.get(sourceId));
    timers.delete(sourceId);
  }
}

export function removeLayersAfterFade(map: MapLibreMap, layerIds: readonly string[], sourceIds: readonly string[]): void {
  cancelLayerRemoval(map, sourceIds);
  const timer = window.setTimeout(() => {
    cancelLayerRemoval(map, sourceIds);
    try {
      if (map.getStyle() === undefined) return;
      for (const layerId of layerIds) if (map.getLayer(layerId)) map.removeLayer(layerId);
      for (const sourceId of sourceIds) if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {}
  }, LAYER_FADE_MS);

  const timers = removalTimers.get(map) ?? new Map<string, number>();
  for (const sourceId of sourceIds) timers.set(sourceId, timer);
  removalTimers.set(map, timers);
}
