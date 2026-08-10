import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { POINT_LAYER_ID, SOURCE_ID } from "../constants";

const HEATMAP_LAYER_ID = "stations-heatmap";

const FADE_MAX_ZOOM = 14;
const FADE_OPACITY = ["interpolate", ["linear"], ["zoom"], 11, 0.75, FADE_MAX_ZOOM, 0] as unknown as ExpressionSpecification;
const FIXED_OPACITY = 0.75;

export function useHeatmapLayer({
  map,
  isLoaded,
  enabled,
  showStations,
}: {
  map: MapLibreMap | null;
  isLoaded: boolean;
  enabled: boolean;
  showStations: boolean;
}) {
  const showStationsRef = useRef(showStations);
  showStationsRef.current = showStations;

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;

    const add = () => {
      try {
        if (!map.getSource(SOURCE_ID) || map.getLayer(HEATMAP_LAYER_ID)) return;
        const beforeId = map.getLayer(POINT_LAYER_ID) ? POINT_LAYER_ID : undefined;
        map.addLayer(
          {
            id: HEATMAP_LAYER_ID,
            type: "heatmap",
            source: SOURCE_ID,
            maxzoom: showStationsRef.current ? 14 : 24,
            paint: {
              "heatmap-weight": ["interpolate", ["linear"], ["get", "stationCount"], 0, 0, 6, 1],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 13, 3],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(0,0,0,0)",
                0.15,
                "rgba(0,80,255,0.4)",
                0.35,
                "rgba(0,200,255,0.65)",
                0.6,
                "rgba(255,200,0,0.8)",
                0.8,
                "rgba(255,80,0,0.9)",
                1,
                "rgba(220,0,0,1)",
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 20, 10, 40, 14, 70],
              "heatmap-opacity": showStationsRef.current ? FADE_OPACITY : FIXED_OPACITY,
            },
          } as LayerSpecification,
          beforeId,
        );
      } catch {
        // Layer may not exist
      }
    };

    add();
    map.on("styledata", add);

    return () => {
      map.off("styledata", add);
      try {
        if (map.getStyle() !== undefined && map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
      } catch {}
    };
  }, [map, isLoaded, enabled]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled || !map.getLayer(HEATMAP_LAYER_ID)) return;
    map.setPaintProperty(HEATMAP_LAYER_ID, "heatmap-opacity", showStations ? FADE_OPACITY : FIXED_OPACITY);
    map.setLayerZoomRange(HEATMAP_LAYER_ID, 0, showStations ? 14 : 24);
  }, [map, isLoaded, enabled, showStations]);
}
