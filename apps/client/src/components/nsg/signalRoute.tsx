import type { FeatureCollection, LineString } from "geojson";
import type { ExpressionSpecification, GeoJSONSource } from "maplibre-gl";
import { memo, useEffect, useMemo, useRef } from "react";

import { onBeforeStyleChange, useMap } from "@/components/ui/map";
import { hasCoarsePointer } from "@/lib/dom/pointer";
import { createNsgRouteGeometry } from "@/lib/nsg/geometry";
import type { NsgSignalTrail } from "@/lib/nsg/signal";

export const NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID = "route-layer-nsg-track-hitbox";
export const NSG_SIGNAL_ROUTE_SOURCE_ID = "nsg-signal-route";
export const NSG_SIGNAL_ROUTE_LAYER_ID = "route-layer-nsg-track";
const EMPTY_LAYER_IDS: readonly string[] = [];
const ACTIVE_TRAIL: ExpressionSpecification = ["boolean", ["feature-state", "active"], false];
const INSTANT_TRANSITION = { duration: 0, delay: 0 };

type SignalRouteGeometry = FeatureCollection<LineString, { color: string; simKey: string }>;

const EMPTY_ROUTE: SignalRouteGeometry = { type: "FeatureCollection", features: [] };

function createSignalRouteGeometry(trails: ReadonlyMap<string, NsgSignalTrail>): SignalRouteGeometry {
  const features: SignalRouteGeometry["features"] = [];
  for (const [simKey, trail] of trails)
    for (const feature of createNsgRouteGeometry(trail.points).features) features.push({ ...feature, properties: { ...feature.properties, simKey } });
  return { type: "FeatureCollection", features };
}

export const SignalRoute = memo(function SignalRoute({
  trails,
  activeSimKey,
  beforeLayerIds = EMPTY_LAYER_IDS,
}: {
  trails: ReadonlyMap<string, NsgSignalTrail>;
  activeSimKey: string;
  beforeLayerIds?: readonly string[];
}) {
  const { map, isLoaded } = useMap();
  const data = useMemo(() => createSignalRouteGeometry(trails), [trails]);
  const previousActiveSimKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const beforeLayerId = beforeLayerIds.find((candidate) => map.getLayer(candidate) !== undefined);

    if (!map.getSource(NSG_SIGNAL_ROUTE_SOURCE_ID))
      map.addSource(NSG_SIGNAL_ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_ROUTE, promoteId: "simKey" });
    if (!map.getLayer(NSG_SIGNAL_ROUTE_LAYER_ID))
      map.addLayer(
        {
          id: NSG_SIGNAL_ROUTE_LAYER_ID,
          type: "line",
          source: NSG_SIGNAL_ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 14, ["case", ACTIVE_TRAIL, 3, 0], 18, ["case", ACTIVE_TRAIL, 5, 0]],
            "line-width-transition": INSTANT_TRANSITION,
            "line-opacity": ["case", ACTIVE_TRAIL, 1, 0],
            "line-opacity-transition": INSTANT_TRANSITION,
          },
        },
        beforeLayerId,
      );
    if (!map.getLayer(NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID))
      map.addLayer(
        {
          id: NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID,
          type: "line",
          source: NSG_SIGNAL_ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-width": ["case", ACTIVE_TRAIL, hasCoarsePointer() ? 32 : 16, 0],
            "line-width-transition": INSTANT_TRANSITION,
            "line-opacity": 0,
          },
        },
        beforeLayerId,
      );

    const removeRoute = () => {
      previousActiveSimKeyRef.current = null;
      try {
        if (map.getLayer(NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID)) map.removeLayer(NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID);
        if (map.getLayer(NSG_SIGNAL_ROUTE_LAYER_ID)) map.removeLayer(NSG_SIGNAL_ROUTE_LAYER_ID);
        if (map.getSource(NSG_SIGNAL_ROUTE_SOURCE_ID)) map.removeSource(NSG_SIGNAL_ROUTE_SOURCE_ID);
      } catch {}
    };
    const unsubscribe = onBeforeStyleChange(map, removeRoute);

    return () => {
      unsubscribe();
      removeRoute();
    };
  }, [map, isLoaded, beforeLayerIds]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const source = map.getSource(NSG_SIGNAL_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    void source.setData(data);
  }, [map, isLoaded, data]);

  useEffect(() => {
    if (!map || !isLoaded || !map.getSource(NSG_SIGNAL_ROUTE_SOURCE_ID)) return;
    map.setFeatureState({ source: NSG_SIGNAL_ROUTE_SOURCE_ID, id: activeSimKey }, { active: true });
    const previousActiveSimKey = previousActiveSimKeyRef.current;
    if (previousActiveSimKey !== null && previousActiveSimKey !== activeSimKey)
      map.setFeatureState({ source: NSG_SIGNAL_ROUTE_SOURCE_ID, id: previousActiveSimKey }, { active: false });
    previousActiveSimKeyRef.current = activeSimKey;
  }, [map, isLoaded, data, activeSimKey]);

  return null;
});
