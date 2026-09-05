import type { GeoJSONSource } from "maplibre-gl";
import { useEffect, useMemo } from "react";

import { onBeforeStyleChange, useMap } from "@/components/ui/map";
import { type NsgRouteGeometry, createNsgRouteGeometry } from "@/lib/nsg/geometry";
import type { NsgSignalPoint } from "@/lib/nsg/signal";

export const NSG_SIGNAL_ROUTE_LAYER_ID = "route-layer-nsg-track";
const SOURCE_ID = "nsg-signal-route";
const EMPTY_ROUTE: NsgRouteGeometry = { type: "FeatureCollection", features: [] };

export function NsgSignalRoute({ points }: { points: readonly NsgSignalPoint[] }) {
  const { map, isLoaded } = useMap();
  const data = useMemo(() => createNsgRouteGeometry(points), [points]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_ROUTE });
    if (!map.getLayer(NSG_SIGNAL_ROUTE_LAYER_ID))
      map.addLayer({
        id: NSG_SIGNAL_ROUTE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 5], "line-opacity": 1 },
      });

    const removeRoute = () => {
      try {
        if (map.getLayer(NSG_SIGNAL_ROUTE_LAYER_ID)) map.removeLayer(NSG_SIGNAL_ROUTE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {}
    };
    const unsubscribe = onBeforeStyleChange(map, removeRoute);

    return () => {
      unsubscribe();
      removeRoute();
    };
  }, [map, isLoaded]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) void source.setData(data);
  }, [map, isLoaded, data]);

  return null;
}
