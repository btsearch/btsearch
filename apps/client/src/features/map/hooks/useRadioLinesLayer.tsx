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

import { RadioLineTooltipContent } from "../components/radioLineTooltipContent";
import {
  POINT_LAYER_ID,
  RADIOLINES_ENDPOINTS_SOURCE_ID,
  RADIOLINES_ENDPOINT_LAYER_ID,
  RADIOLINES_HITBOX_LAYER_ID,
  RADIOLINES_LINE_LAYER_ID,
  RADIOLINES_SOURCE_ID,
} from "../constants";
import type { DuplexRadioLink } from "../utils";
import { onBeforeStyleChange } from "@/components/ui/map";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

type UseRadioLinesLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  linesGeoJSON: GeoJsonSourceData;
  endpointsGeoJSON: GeoJsonSourceData;
  duplexLinks: DuplexRadioLink[];
  minZoom: number;
  isPickingReceiver?: boolean;
  onFeatureClick: (links: DuplexRadioLink[], coordinates: [number, number]) => void;
};

function createLineLayerConfig(minzoom: number): LayerSpecification {
  return {
    id: RADIOLINES_LINE_LAYER_ID,
    type: "line",
    source: RADIOLINES_SOURCE_ID,
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
    id: RADIOLINES_HITBOX_LAYER_ID,
    type: "line",
    source: RADIOLINES_SOURCE_ID,
    minzoom,
    paint: { "line-width": 16, "line-opacity": 0 },
  };
}

function createEndpointLayerConfig(minzoom: number): LayerSpecification {
  return {
    id: RADIOLINES_ENDPOINT_LAYER_ID,
    type: "circle",
    source: RADIOLINES_ENDPOINTS_SOURCE_ID,
    minzoom,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 4],
      "circle-color": ["get", "color"],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  };
}

const HITBOX_LAYER_IDS = [RADIOLINES_HITBOX_LAYER_ID, RADIOLINES_ENDPOINT_LAYER_ID];
const ALL_LAYERS = [RADIOLINES_LINE_LAYER_ID, RADIOLINES_HITBOX_LAYER_ID, RADIOLINES_ENDPOINT_LAYER_ID] as const;

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

function indexLinksByRadioLineId(links: DuplexRadioLink[]): Map<number, DuplexRadioLink> {
  const index = new Map<number, DuplexRadioLink>();
  for (const link of links) for (const direction of link.directions) index.set(direction.id, link);
  return index;
}

function getFeatureLinks(features: MapGeoJSONFeature[] | undefined, linkByRadioLineId: Map<number, DuplexRadioLink>): DuplexRadioLink[] {
  const links = new Set<DuplexRadioLink>();
  for (const feature of features ?? []) {
    const link = linkByRadioLineId.get(feature.properties?.radioLineId);
    if (link) links.add(link);
  }
  return [...links];
}

export function useRadioLinesLayer({
  map,
  isLoaded,
  linesGeoJSON,
  endpointsGeoJSON,
  duplexLinks,
  minZoom,
  isPickingReceiver = false,
  onFeatureClick,
}: UseRadioLinesLayerArgs) {
  const linkByRadioLineId = useMemo(() => indexLinksByRadioLineId(duplexLinks), [duplexLinks]);
  const stableRefs = useRef({ onFeatureClick, linkByRadioLineId, linesGeoJSON, endpointsGeoJSON, isPickingReceiver });
  const tooltipRef = useRef<ActiveTooltip | null>(null);

  useEffect(() => {
    stableRefs.current = { onFeatureClick, linkByRadioLineId, linesGeoJSON, endpointsGeoJSON, isPickingReceiver };
  }, [onFeatureClick, linkByRadioLineId, linesGeoJSON, endpointsGeoJSON, isPickingReceiver]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const useHoverListeners = hasReliableHoverPointer();

    const ensureLayersExist = () => {
      try {
        const { linesGeoJSON, endpointsGeoJSON } = stableRefs.current;
        const beforeLayer = map.getLayer(POINT_LAYER_ID) ? POINT_LAYER_ID : undefined;

        if (!map.getSource(RADIOLINES_SOURCE_ID)) map.addSource(RADIOLINES_SOURCE_ID, { type: "geojson", data: linesGeoJSON });
        if (!map.getSource(RADIOLINES_ENDPOINTS_SOURCE_ID))
          map.addSource(RADIOLINES_ENDPOINTS_SOURCE_ID, { type: "geojson", data: endpointsGeoJSON });

        if (!map.getLayer(RADIOLINES_LINE_LAYER_ID)) map.addLayer(createLineLayerConfig(minZoom), beforeLayer);
        if (!map.getLayer(RADIOLINES_HITBOX_LAYER_ID)) map.addLayer(createHitboxLayerConfig(minZoom), beforeLayer);
        if (!map.getLayer(RADIOLINES_ENDPOINT_LAYER_ID)) map.addLayer(createEndpointLayerConfig(minZoom), beforeLayer);
      } catch {
        // Layers may not exist
      }
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

      const links = getFeatureLinks(e.features, stableRefs.current.linkByRadioLineId);
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

      const links = getFeatureLinks(e.features, stableRefs.current.linkByRadioLineId);
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
      tooltip.root.render(<RadioLineTooltipContent links={links} />);
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
        } catch {
          /* already removed or map destroyed */
        }
      }
      for (const sourceId of [RADIOLINES_SOURCE_ID, RADIOLINES_ENDPOINTS_SOURCE_ID]) {
        try {
          map.removeSource(sourceId);
        } catch {
          /* already removed or map destroyed */
        }
      }
    };
  }, [map, isLoaded, minZoom]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    void (map.getSource(RADIOLINES_SOURCE_ID) as GeoJSONSource | undefined)?.setData(linesGeoJSON);
    void (map.getSource(RADIOLINES_ENDPOINTS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(endpointsGeoJSON);
  }, [map, isLoaded, linesGeoJSON, endpointsGeoJSON]);
}
