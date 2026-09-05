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
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { onBeforeStyleChange } from "@/components/ui/map";
import { normalizeOperatorName } from "@/lib/cellular/operators";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";

import { RadioLineTooltipContent } from "../components/radioLineTooltipContent";
import {
  POINT_LAYER_ID,
  RADIOLINES_ENDPOINTS_SOURCE_ID,
  RADIOLINES_ENDPOINT_LAYER_ID,
  RADIOLINES_HITBOX_LAYER_ID,
  RADIOLINES_LINE_LAYER_ID,
  RADIOLINES_SOURCE_ID,
} from "../constants";
import type { DuplexRadioLink, RadioLinkType } from "../utils";
import { findDuplexLinkByRadioLineId } from "../utils";

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

type UseRadioLinesLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  linesGeoJSON: GeoJsonSourceData;
  endpointsGeoJSON: GeoJsonSourceData;
  duplexLinks: DuplexRadioLink[];
  minZoom: number;
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

const HITBOX_LAYERS = [RADIOLINES_HITBOX_LAYER_ID, RADIOLINES_ENDPOINT_LAYER_ID] as const;
const ALL_LAYERS = [RADIOLINES_LINE_LAYER_ID, RADIOLINES_HITBOX_LAYER_ID, RADIOLINES_ENDPOINT_LAYER_ID] as const;

type ActiveTooltip = {
  popup: Popup;
  root: ReturnType<typeof createRoot>;
  cacheKey: string;
};

function destroyTooltip(state: ActiveTooltip | null): null {
  state?.root.unmount();
  state?.popup.remove();
  return null;
}

function buildTooltip(state: ActiveTooltip | null, cacheKey: string): ActiveTooltip {
  if (state?.cacheKey === cacheKey) return state;

  state?.root.unmount();
  state?.popup.remove();

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

type Direction = { freq: string; bandwidth: string | null; polarization: string | null; forward: boolean };

type TooltipEntry = {
  radioLineId: number;
  color: string;
  operatorName: string;
  distance: string;
  directionCount: number;
  directions: Direction[];
  linkType: RadioLinkType | undefined;
  dlSpeed: string | null | undefined;
  ulSpeed: string | null | undefined;
};

function deduplicateByGroupId(features: MapGeoJSONFeature[], duplexLinks: DuplexRadioLink[]): DuplexRadioLink[] {
  const seen = new Set<string>();
  const result: DuplexRadioLink[] = [];
  for (const f of features) {
    const link = findDuplexLinkByRadioLineId(f.properties?.radioLineId, duplexLinks);
    if (!link || seen.has(link.groupId)) continue;
    seen.add(link.groupId);
    result.push(link);
  }
  return result;
}

function parseDirections(raw: string | undefined): Direction[] {
  try {
    return JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
}

export function useRadioLinesLayer({ map, isLoaded, linesGeoJSON, endpointsGeoJSON, duplexLinks, minZoom, onFeatureClick }: UseRadioLinesLayerArgs) {
  const stableRefs = useRef({ onFeatureClick, duplexLinks, linesGeoJSON, endpointsGeoJSON });
  const tooltipRef = useRef<ActiveTooltip | null>(null);

  useEffect(() => {
    stableRefs.current = { onFeatureClick, duplexLinks, linesGeoJSON, endpointsGeoJSON };
  }, [onFeatureClick, duplexLinks, linesGeoJSON, endpointsGeoJSON]);

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
      if (isNearStation(e.point)) return;

      const allFeatures = map.queryRenderedFeatures(e.point, { layers: [...HITBOX_LAYERS] });
      const links = deduplicateByGroupId(allFeatures, stableRefs.current.duplexLinks);
      if (!links.length) return;

      tooltipRef.current = destroyTooltip(tooltipRef.current);
      stableRefs.current.onFeatureClick(links, [e.lngLat.lng, e.lngLat.lat]);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseMove = (e: MapLayerMouseEvent) => {
      if (isNearStation(e.point)) {
        tooltipRef.current = destroyTooltip(tooltipRef.current);
        return;
      }

      const allFeatures = map.queryRenderedFeatures(e.point, { layers: [...HITBOX_LAYERS] });
      const uniqueLinks = deduplicateByGroupId(allFeatures, stableRefs.current.duplexLinks);
      const entries: TooltipEntry[] = uniqueLinks.map((link) => {
        const p = allFeatures.find((f) => f.properties?.radioLineId === link.directions[0].id)?.properties ?? {};
        return {
          radioLineId: link.directions[0].id,
          color: p.color ?? "#3b82f6",
          operatorName: p.operatorName ?? "",
          distance: p.distanceFormatted ?? "",
          directionCount: p.directionCount ?? 1,
          directions: parseDirections(p.directionsJson),
          linkType: p.linkType as RadioLinkType | undefined,
          dlSpeed: p.dlSpeed,
          ulSpeed: p.ulSpeed,
        };
      });

      if (!entries.length) {
        tooltipRef.current = destroyTooltip(tooltipRef.current);
        return;
      }

      const cacheKey = entries.map((entry) => entry.radioLineId).join(",");
      const tooltip = buildTooltip(tooltipRef.current, cacheKey);
      tooltipRef.current = tooltip;

      tooltip.root.render(
        <div className={entries.length > 1 ? "divide-y divide-border/40" : undefined}>
          {entries.map((entry) => (
            <RadioLineTooltipContent
              key={entry.radioLineId}
              color={entry.color}
              operatorName={normalizeOperatorName(entry.operatorName)}
              distanceFormatted={entry.distance}
              directions={entry.directions}
              directionCount={entry.directionCount}
              linkType={entry.linkType}
              dlSpeed={entry.dlSpeed}
              ulSpeed={entry.ulSpeed}
            />
          ))}
        </div>,
      );
      tooltip.popup.setLngLat(e.lngLat).addTo(map);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };

    const attachLayerListeners = () => {
      for (const layerId of HITBOX_LAYERS) {
        map.on("click", layerId, handleClick);
        if (!useHoverListeners) continue;
        map.on("mouseenter", layerId, handleMouseEnter);
        map.on("mousemove", layerId, handleMouseMove);
        map.on("mouseleave", layerId, handleMouseLeave);
      }
    };

    const detachLayerListeners = () => {
      for (const layerId of HITBOX_LAYERS) {
        map.off("click", layerId, handleClick);
        if (!useHoverListeners) continue;
        map.off("mouseenter", layerId, handleMouseEnter);
        map.off("mousemove", layerId, handleMouseMove);
        map.off("mouseleave", layerId, handleMouseLeave);
      }
      if (useHoverListeners) map.getCanvas().style.cursor = "";
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
