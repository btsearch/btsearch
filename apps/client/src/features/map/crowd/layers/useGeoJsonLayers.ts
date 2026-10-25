import type { FeatureCollection } from "geojson";
import type { AddLayerObject, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";

import type { FadedLayer } from "./layerFade";
import { type LayerPlacement, findLayerAbove } from "./layerOrder";
import { useFadedLayerGroup } from "./useFadedLayerGroup";

type PaintProperty = Parameters<MapLibreMap["setPaintProperty"]>[1];

export type GeoJsonLayer = { spec: AddLayerObject & { paint?: object }; fade: FadedLayer };

type UseGeoJsonLayersArgs = LayerPlacement & {
  map: MapLibreMap | null;
  isLoaded: boolean;
  sourceId: string;
  data: FeatureCollection | null;
  layers: readonly GeoJsonLayer[];
  addImages?: (map: MapLibreMap) => void;
};

function isFadeProperty(property: string, fade: FadedLayer): boolean {
  return property === fade.property || property === `${fade.property}-transition`;
}

export function useGeoJsonLayers({ map, isLoaded, sourceId, data, layers, addImages, ...placement }: UseGeoJsonLayersArgs): void {
  const isShown = data !== null;
  const paintKey = JSON.stringify(layers.map(({ spec }) => spec.paint ?? null));
  const readLayers = useEffectEvent(() => layers);
  const addDataImages = useEffectEvent((target: MapLibreMap) => addImages?.(target));

  useFadedLayerGroup({
    map,
    isLoaded,
    isShown,
    layers: layers.map((layer) => layer.fade),
    sourceIds: [sourceId],
    ensureLayers: (target) => {
      if (data === null) return;
      addImages?.(target);
      if (!target.getSource(sourceId)) target.addSource(sourceId, { type: "geojson", data });
      for (const { spec } of layers) if (!target.getLayer(spec.id)) target.addLayer(spec, findLayerAbove(target, spec.id, placement));
    },
  });

  useEffect(() => {
    if (!map || !isLoaded || data === null) return;
    try {
      addDataImages(map);
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      void source?.setData(data);
    } catch {}
  }, [map, isLoaded, sourceId, data]);

  useEffect(() => {
    if (!map || !isLoaded || !isShown) return;
    try {
      for (const { spec, fade } of readLayers()) {
        if (!map.getLayer(spec.id) || spec.paint === undefined) continue;
        for (const [property, value] of Object.entries(spec.paint)) {
          if (!isFadeProperty(property, fade)) map.setPaintProperty(spec.id, property as PaintProperty, value);
        }
      }
    } catch {}
  }, [map, isLoaded, isShown, paintKey]);
}
