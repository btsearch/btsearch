import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";

import { type FadedLayer, cancelLayerRemoval, removeLayersAfterFade, setFadedLayersShown } from "./layerFade";

type UseFadedLayerGroupArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  isShown: boolean;
  layers: readonly FadedLayer[];
  sourceIds: readonly string[];
  ensureLayers: (map: MapLibreMap) => void;
};

export function useFadedLayerGroup({ map, isLoaded, isShown, layers, sourceIds, ensureLayers }: UseFadedLayerGroupArgs): void {
  const addLayers = useEffectEvent(ensureLayers);
  const readLayers = useEffectEvent(() => layers);
  const readSourceIds = useEffectEvent(() => sourceIds);

  useEffect(() => {
    if (!map || !isLoaded || !isShown) return;
    cancelLayerRemoval(map, readSourceIds());

    const restoreLayers = () => {
      try {
        addLayers(map);
        setFadedLayersShown(map, readLayers(), true);
      } catch {}
    };

    try {
      addLayers(map);
    } catch {}
    const frame = requestAnimationFrame(() => {
      try {
        setFadedLayersShown(map, readLayers(), true);
      } catch {}
    });
    map.on("styledata", restoreLayers);

    return () => {
      cancelAnimationFrame(frame);
      map.off("styledata", restoreLayers);
      const fadedLayers = readLayers();
      try {
        if (map.getStyle() !== undefined) setFadedLayersShown(map, fadedLayers, false);
      } catch {}
      removeLayersAfterFade(
        map,
        fadedLayers.map((layer) => layer.id),
        readSourceIds(),
      );
    };
  }, [map, isLoaded, isShown]);
}
