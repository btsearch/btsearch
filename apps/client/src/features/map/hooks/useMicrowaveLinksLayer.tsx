import {
  type GeoJSONSource,
  type LayerSpecification,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type Map as MapLibreMap,
  type Point,
  type PointLike,
  Popup,
} from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

import { MicrowaveLinkTooltipContent } from "../components/microwaveLinkTooltipContent";
import {
  MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID,
  MICROWAVE_LINKS_ENDPOINT_LAYER_ID,
  MICROWAVE_LINKS_HITBOX_LAYER_ID,
  MICROWAVE_LINKS_LINE_LAYER_ID,
  MICROWAVE_LINKS_SOURCE_ID,
  POINT_LAYER_ID,
} from "../constants";
import type { DuplexMicrowaveLink, MicrowaveLinkLookups } from "../utils";
import { onBeforeStyleChange } from "@/components/ui/map";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

type UseMicrowaveLinksLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  linesGeoJSON: GeoJsonSourceData;
  endpointsGeoJSON: GeoJsonSourceData;
  duplexLinks: DuplexMicrowaveLink[];
  lookups: MicrowaveLinkLookups | undefined;
  minZoom: number;
  isPickingReceiver?: boolean;
  onFeatureClick: (links: DuplexMicrowaveLink[], coordinates: [number, number]) => void;
};

function createLineLayerConfig(minzoom: number): LayerSpecification {
  return {
    id: MICROWAVE_LINKS_LINE_LAYER_ID,
    type: "line",
    source: MICROWAVE_LINKS_SOURCE_ID,
    minzoom,
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3, 18, 5],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 13, 0.8],
      "line-dasharray": ["case", ["get", "isExpired"], ["literal", [4, 3]], ["literal", [1, 0]]],
    },
  };
}

function createHitboxLayerConfig(minzoom: number): LayerSpecification {
  return {
    id: MICROWAVE_LINKS_HITBOX_LAYER_ID,
    type: "line",
    source: MICROWAVE_LINKS_SOURCE_ID,
    minzoom,
    paint: { "line-width": 16, "line-opacity": 0 },
  };
}

function createEndpointLayerConfig(minzoom: number): LayerSpecification {
  return {
    id: MICROWAVE_LINKS_ENDPOINT_LAYER_ID,
    type: "circle",
    source: MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID,
    minzoom,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 4],
      "circle-color": ["get", "color"],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  };
}

const HITBOX_LAYER_IDS = [MICROWAVE_LINKS_HITBOX_LAYER_ID, MICROWAVE_LINKS_ENDPOINT_LAYER_ID];
const ALL_LAYERS = [MICROWAVE_LINKS_LINE_LAYER_ID, MICROWAVE_LINKS_HITBOX_LAYER_ID, MICROWAVE_LINKS_ENDPOINT_LAYER_ID] as const;

type ActiveTooltip = {
  popup: Popup;
  root: ReturnType<typeof createRoot>;
  cacheKey: string;
};

function destroyTooltip(state: ActiveTooltip | null): null {
  if (state === null) return null;
  state.popup.remove();
  queueMicrotask(() => state.root.unmount());
  return null;
}

function buildTooltip(state: ActiveTooltip | null, cacheKey: string): ActiveTooltip {
  if (state?.cacheKey === cacheKey) return state;

  destroyTooltip(state);

  const container = document.createElement("div");
  const root = createRoot(container);
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    className: "radioline-tooltip",
    maxWidth: "20rem",
    offset: 10,
  }).setDOMContent(container);

  return { popup, root, cacheKey };
}

function indexLinksByMicrowaveLinkId(links: DuplexMicrowaveLink[]): Map<number, DuplexMicrowaveLink> {
  const index = new Map<number, DuplexMicrowaveLink>();
  for (const link of links) for (const direction of link.directions) index.set(direction.id, link);
  return index;
}

function getFeatureLinks(features: MapGeoJSONFeature[] | undefined, linkByMicrowaveLinkId: Map<number, DuplexMicrowaveLink>): DuplexMicrowaveLink[] {
  const links = new Set<DuplexMicrowaveLink>();
  for (const feature of features ?? []) {
    const link = linkByMicrowaveLinkId.get(feature.properties?.microwaveLinkId);
    if (link) links.add(link);
  }
  return [...links];
}

export function useMicrowaveLinksLayer({
  map,
  isLoaded,
  linesGeoJSON,
  endpointsGeoJSON,
  duplexLinks,
  lookups,
  minZoom,
  isPickingReceiver = false,
  onFeatureClick,
}: UseMicrowaveLinksLayerArgs) {
  const linkByMicrowaveLinkId = useMemo(() => indexLinksByMicrowaveLinkId(duplexLinks), [duplexLinks]);
  const stableRefs = useRef({ onFeatureClick, linkByMicrowaveLinkId, lookups, linesGeoJSON, endpointsGeoJSON, isPickingReceiver });
  const tooltipRef = useRef<ActiveTooltip | null>(null);

  useEffect(() => {
    stableRefs.current = { onFeatureClick, linkByMicrowaveLinkId, lookups, linesGeoJSON, endpointsGeoJSON, isPickingReceiver };
  }, [onFeatureClick, linkByMicrowaveLinkId, lookups, linesGeoJSON, endpointsGeoJSON, isPickingReceiver]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const useHoverListeners = hasReliableHoverPointer();

    const ensureLayersExist = () => {
      try {
        const { linesGeoJSON, endpointsGeoJSON } = stableRefs.current;
        const beforeLayer = map.getLayer(POINT_LAYER_ID) ? POINT_LAYER_ID : undefined;

        if (!map.getSource(MICROWAVE_LINKS_SOURCE_ID)) map.addSource(MICROWAVE_LINKS_SOURCE_ID, { type: "geojson", data: linesGeoJSON });
        if (!map.getSource(MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID)) {
          map.addSource(MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID, { type: "geojson", data: endpointsGeoJSON });
        }

        if (!map.getLayer(MICROWAVE_LINKS_LINE_LAYER_ID)) map.addLayer(createLineLayerConfig(minZoom), beforeLayer);
        if (!map.getLayer(MICROWAVE_LINKS_HITBOX_LAYER_ID)) map.addLayer(createHitboxLayerConfig(minZoom), beforeLayer);
        if (!map.getLayer(MICROWAVE_LINKS_ENDPOINT_LAYER_ID)) map.addLayer(createEndpointLayerConfig(minZoom), beforeLayer);
      } catch {}
    };

    const isNearStation = (point: Point): boolean => {
      const layers = [POINT_LAYER_ID, `${POINT_LAYER_ID}-symbol`].filter((id) => map.getLayer(id));
      if (!layers.length) return false;
      const t = 12;
      const bbox: [PointLike, PointLike] = [
        [point.x - t, point.y - t],
        [point.x + t, point.y + t],
      ];
      return map.queryRenderedFeatures(bbox, { layers }).length > 0;
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (stableRefs.current.isPickingReceiver) return;
      if (isNearStation(e.point)) return;

      const links = getFeatureLinks(e.features, stableRefs.current.linkByMicrowaveLinkId);
      if (!links.length) return;

      tooltipRef.current = destroyTooltip(tooltipRef.current);
      stableRefs.current.onFeatureClick(links, [e.lngLat.lng, e.lngLat.lat]);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseMove = (e: MapLayerMouseEvent) => {
      if (stableRefs.current.isPickingReceiver || isNearStation(e.point)) {
        tooltipRef.current = destroyTooltip(tooltipRef.current);
        return;
      }

      const links = getFeatureLinks(e.features, stableRefs.current.linkByMicrowaveLinkId);
      if (!links.length) {
        tooltipRef.current = destroyTooltip(tooltipRef.current);
        return;
      }

      const previousTooltip = tooltipRef.current;
      const tooltip = buildTooltip(previousTooltip, links.map((link) => link.groupId).join(","));
      tooltipRef.current = tooltip;

      if (tooltip === previousTooltip) {
        tooltip.popup.setLngLat(e.lngLat);
        return;
      }
      tooltip.root.render(<MicrowaveLinkTooltipContent links={links} lookups={stableRefs.current.lookups} />);
      tooltip.popup.setLngLat(e.lngLat).addTo(map);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };

    const attachLayerListeners = () => {
      map.on("click", HITBOX_LAYER_IDS, handleClick);
      if (!useHoverListeners) return;
      map.on("mouseenter", HITBOX_LAYER_IDS, handleMouseEnter);
      map.on("mousemove", HITBOX_LAYER_IDS, handleMouseMove);
      map.on("mouseleave", HITBOX_LAYER_IDS, handleMouseLeave);
    };

    const detachLayerListeners = () => {
      map.off("click", HITBOX_LAYER_IDS, handleClick);
      if (useHoverListeners) {
        map.off("mouseenter", HITBOX_LAYER_IDS, handleMouseEnter);
        map.off("mousemove", HITBOX_LAYER_IDS, handleMouseMove);
        map.off("mouseleave", HITBOX_LAYER_IDS, handleMouseLeave);
        map.getCanvas().style.cursor = "";
      }
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };

    ensureLayersExist();
    map.on("styledata", ensureLayersExist);
    attachLayerListeners();
    const unsubscribe = onBeforeStyleChange(map, detachLayerListeners);

    return () => {
      tooltipRef.current = destroyTooltip(tooltipRef.current);

      map.off("styledata", ensureLayersExist);
      unsubscribe();
      detachLayerListeners();

      for (const layerId of ALL_LAYERS) {
        try {
          map.removeLayer(layerId);
        } catch {}
      }
      for (const sourceId of [MICROWAVE_LINKS_SOURCE_ID, MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID]) {
        try {
          map.removeSource(sourceId);
        } catch {}
      }
    };
  }, [map, isLoaded, minZoom]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    void (map.getSource(MICROWAVE_LINKS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(linesGeoJSON);
    void (map.getSource(MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(endpointsGeoJSON);
  }, [map, isLoaded, linesGeoJSON, endpointsGeoJSON]);
}
