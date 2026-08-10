import {
  type GeoJSONFeature,
  type GeoJSONSource,
  type LayerSpecification,
  type MapLayerTouchEvent,
  type Map as MapLibreMap,
  type MapMouseEvent,
  type MapTouchEvent,
  Popup,
} from "maplibre-gl";
import { type ReactNode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { onBeforeStyleChange } from "@/components/ui/map";
import zabkaLogoUrl from "@/features/station-details/components/logos/zabka.svg?url";
import type { MapPointStyle } from "@/hooks/usePreferences";
import { hasReliableHoverPointer } from "@/lib/pointer";

import { POINT_LAYER_ID, SOURCE_ID } from "../constants";
import { syncMarkerImages, syncPieImages } from "../pieChart";

type FeatureClickData = {
  coordinates: [number, number];
  locationId: number;
  city?: string;
  address?: string;
  source: string;
};

type FeatureClickHandler = (data: FeatureClickData) => void;

type MapFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

type UseMapLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  geoJSON: MapFeatureCollection;
  onFeatureClick: FeatureClickHandler;
  onFeatureContextMenu?: FeatureClickHandler;
  onFeatureMouseDown?: (locationId: number) => void;
  renderHoverTooltip?: (data: FeatureClickData) => ReactNode | null;
  pointStyle?: MapPointStyle;
  useZabkaMarkers?: boolean;
  blockedByLayers?: string[];
};

type ActiveTooltip = {
  popup: Popup;
  root: ReturnType<typeof createRoot>;
  activeLocationId: number;
};

function destroyTooltip(state: ActiveTooltip | null): null {
  state?.root.unmount();
  state?.popup.remove();
  return null;
}

function buildTooltip(state: ActiveTooltip | null, locationId: number): ActiveTooltip {
  if (state?.activeLocationId === locationId) return state;

  state?.root.unmount();
  state?.popup.remove();

  const container = document.createElement("div");
  const root = createRoot(container);
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    className: "station-hover-tooltip",
    maxWidth: "none",
    offset: 12,
  }).setDOMContent(container);

  return { popup, root, activeLocationId: locationId };
}

const SYMBOL_LAYER_ID = `${POINT_LAYER_ID}-symbol`;
const LAYER_IDS = [POINT_LAYER_ID, SYMBOL_LAYER_ID] as const;
const ZABKA_IMAGE_ID = "zabka-marker";
const TOUCH_LONG_PRESS_MS = 500;
const TOUCH_MOVE_TOLERANCE_PX = 12;

const CIRCLE_LAYER_CONFIG: LayerSpecification = {
  id: POINT_LAYER_ID,
  type: "circle",
  source: SOURCE_ID,
  filter: ["!", ["get", "isMultiOperator"]],
  paint: {
    "circle-color": ["get", "color"],
    "circle-radius": 7,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  },
};

const SYMBOL_LAYER_CONFIG: LayerSpecification = {
  id: SYMBOL_LAYER_ID,
  type: "symbol",
  source: SOURCE_ID,
  filter: ["get", "isMultiOperator"],
  layout: {
    "icon-image": ["get", "pieImageId"],
    "icon-size": 0.5,
    "icon-allow-overlap": true,
  },
};

const MARKER_SINGLE_LAYER_CONFIG: LayerSpecification = {
  id: POINT_LAYER_ID,
  type: "symbol",
  source: SOURCE_ID,
  filter: ["!", ["get", "isMultiOperator"]],
  layout: {
    "icon-image": ["concat", "mpin-", ["get", "color"]],
    "icon-size": 0.85,
    "icon-allow-overlap": true,
    "icon-anchor": "bottom",
  },
};

const MARKER_MULTI_LAYER_CONFIG: LayerSpecification = {
  id: SYMBOL_LAYER_ID,
  type: "symbol",
  source: SOURCE_ID,
  filter: ["get", "isMultiOperator"],
  layout: {
    "icon-image": ["concat", "m", ["get", "pieImageId"]],
    "icon-size": 0.85,
    "icon-allow-overlap": true,
    "icon-anchor": "bottom",
  },
};

const ZABKA_LAYER_CONFIG: LayerSpecification = {
  id: POINT_LAYER_ID,
  type: "symbol",
  source: SOURCE_ID,
  layout: {
    "icon-image": ZABKA_IMAGE_ID,
    "icon-size": 0.42,
    "icon-allow-overlap": true,
  },
};

const ZABKA_EMPTY_LAYER_CONFIG: LayerSpecification = {
  id: SYMBOL_LAYER_ID,
  type: "symbol",
  source: SOURCE_ID,
  filter: ["==", ["get", "locationId"], null],
  layout: {
    "icon-image": ZABKA_IMAGE_ID,
  },
};

function syncZabkaImage(map: MapLibreMap, addedImages: Set<string>) {
  if (addedImages.has(ZABKA_IMAGE_ID)) return;
  if (map.hasImage(ZABKA_IMAGE_ID)) {
    addedImages.add(ZABKA_IMAGE_ID);
    return;
  }

  const image = new Image(77, 31);
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 77;
    canvas.height = 31;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
      if (!map.hasImage(ZABKA_IMAGE_ID)) map.addImage(ZABKA_IMAGE_ID, imageData);
      addedImages.add(ZABKA_IMAGE_ID);
      map.triggerRepaint();
    } catch {}
  };
  image.src = zabkaLogoUrl;
}

function extractFeatureClickData(feature: GeoJSONFeature): FeatureClickData | null {
  if (feature.geometry.type !== "Point") return null;

  const { locationId, city, address, source } = feature.properties ?? {};
  if (!locationId) return null;

  return {
    coordinates: feature.geometry.coordinates as [number, number],
    locationId,
    city,
    address,
    source: source || "internal",
  };
}

export function useMapLayer({
  map,
  isLoaded,
  geoJSON,
  onFeatureClick,
  onFeatureContextMenu,
  onFeatureMouseDown,
  renderHoverTooltip,
  pointStyle = "dots",
  useZabkaMarkers = false,
  blockedByLayers = [],
}: UseMapLayerArgs) {
  const callbackRefs = useRef({ onFeatureClick, onFeatureContextMenu, onFeatureMouseDown, renderHoverTooltip });
  callbackRefs.current = { onFeatureClick, onFeatureContextMenu, onFeatureMouseDown, renderHoverTooltip };
  const tooltipRef = useRef<ActiveTooltip | null>(null);
  const blockedByLayersRef = useRef(blockedByLayers);
  blockedByLayersRef.current = blockedByLayers;

  const geoJSONRef = useRef(geoJSON);
  geoJSONRef.current = geoJSON;
  const lastAppliedDataRef = useRef<{ source: GeoJSONSource; data: MapFeatureCollection } | null>(null);

  const addedImagesRef = useRef(new Set<string>());

  useEffect(() => {
    if (!map || !isLoaded) return;

    const useHoverListeners = hasReliableHoverPointer();
    let longPressTimer: number | null = null;
    let longPressStartPoint: { x: number; y: number } | null = null;
    let suppressNextClick = false;
    let suppressClickTimer: number | null = null;

    const clearLongPressTimer = () => {
      if (longPressTimer === null) return;
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStartPoint = null;
    };

    const clearSuppressClickTimer = () => {
      if (suppressClickTimer === null) return;
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
    };

    const suppressUpcomingClick = () => {
      clearSuppressClickTimer();
      suppressNextClick = true;
      suppressClickTimer = window.setTimeout(() => {
        suppressNextClick = false;
        suppressClickTimer = null;
      }, TOUCH_LONG_PRESS_MS * 2);
    };

    const ensureLayersExist = () => {
      try {
        if (!map.getSource(SOURCE_ID)) {
          const initialData = geoJSONRef.current;
          map.addSource(SOURCE_ID, { type: "geojson", data: initialData as unknown as GeoJsonSourceData });
          const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
          if (source) lastAppliedDataRef.current = { source, data: initialData };
          addedImagesRef.current.clear();
        }

        if (useZabkaMarkers) {
          syncZabkaImage(map, addedImagesRef.current);
          if (!map.getLayer(POINT_LAYER_ID)) map.addLayer(ZABKA_LAYER_CONFIG);
          if (!map.getLayer(SYMBOL_LAYER_ID)) map.addLayer(ZABKA_EMPTY_LAYER_CONFIG);
        } else if (pointStyle === "markers") {
          if (!map.getLayer(POINT_LAYER_ID)) map.addLayer(MARKER_SINGLE_LAYER_CONFIG);
          if (!map.getLayer(SYMBOL_LAYER_ID)) map.addLayer(MARKER_MULTI_LAYER_CONFIG);
          syncMarkerImages(map, geoJSONRef.current.features, addedImagesRef.current);
        } else {
          if (!map.getLayer(POINT_LAYER_ID)) map.addLayer(CIRCLE_LAYER_CONFIG);
          if (!map.getLayer(SYMBOL_LAYER_ID)) map.addLayer(SYMBOL_LAYER_CONFIG);
          syncPieImages(map, geoJSONRef.current.features, addedImagesRef.current);
        }
      } catch {
        // Layers may not exist
      }
    };

    const handleMouseDown = (e: MapMouseEvent) => {
      const { onFeatureMouseDown } = callbackRefs.current;
      if (!onFeatureMouseDown) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [...LAYER_IDS] });
      const locationId = features[0]?.properties?.locationId;
      if (locationId) onFeatureMouseDown(locationId);
    };

    const handleClick = (e: MapMouseEvent) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        clearSuppressClickTimer();
        e.preventDefault();
        return;
      }
      const blockedLayers = blockedByLayersRef.current;
      if (blockedLayers.length > 0 && map.queryRenderedFeatures(e.point, { layers: blockedLayers }).length > 0) return;
      const features = map.queryRenderedFeatures(e.point, { layers: [...LAYER_IDS] });
      const data = features[0] && extractFeatureClickData(features[0]);
      if (!data) return;
      callbackRefs.current.onFeatureClick(data);
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };

    const handleContextMenu = (e: MapMouseEvent) => {
      const { onFeatureContextMenu } = callbackRefs.current;
      if (!onFeatureContextMenu) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [...LAYER_IDS] });
      const data = features[0] && extractFeatureClickData(features[0]);
      if (data) {
        e.preventDefault();
        onFeatureContextMenu(data);
      }
    };

    const handleTouchStart = (e: MapLayerTouchEvent) => {
      const { onFeatureContextMenu } = callbackRefs.current;
      if (!onFeatureContextMenu) return;
      if (e.originalEvent.touches.length !== 1) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [...LAYER_IDS] });
      const data = features[0] && extractFeatureClickData(features[0]);
      if (!data) return;

      clearLongPressTimer();
      longPressStartPoint = { x: e.point.x, y: e.point.y };
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        longPressStartPoint = null;
        suppressUpcomingClick();
        e.preventDefault();
        onFeatureContextMenu(data);
      }, TOUCH_LONG_PRESS_MS);
    };

    const handleTouchMove = (e: MapTouchEvent) => {
      if (longPressTimer === null || longPressStartPoint === null) return;
      if (e.originalEvent.touches.length !== 1) {
        clearLongPressTimer();
        return;
      }
      const dx = e.point.x - longPressStartPoint.x;
      const dy = e.point.y - longPressStartPoint.y;
      if (Math.hypot(dx, dy) > TOUCH_MOVE_TOLERANCE_PX) clearLongPressTimer();
    };

    const handleTouchEnd = () => {
      clearLongPressTimer();
    };

    const handleMouseEnter = (e: MapMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";

      const { renderHoverTooltip } = callbackRefs.current;
      if (!renderHoverTooltip) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [...LAYER_IDS] });
      const data = features[0] && extractFeatureClickData(features[0]);
      if (!data) return;

      const content = renderHoverTooltip(data);
      if (!content) return;

      const tooltip = buildTooltip(tooltipRef.current, data.locationId);
      tooltipRef.current = tooltip;
      tooltip.root.render(content);
      tooltip.popup.setLngLat(data.coordinates).addTo(map);
    };

    const handleMouseMove = (e: MapMouseEvent) => {
      const { renderHoverTooltip } = callbackRefs.current;
      if (!renderHoverTooltip) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [...LAYER_IDS] });
      const data = features[0] && extractFeatureClickData(features[0]);

      if (!data) {
        tooltipRef.current = destroyTooltip(tooltipRef.current);
        return;
      }

      const activeTooltip = tooltipRef.current;
      if (activeTooltip !== null && activeTooltip.activeLocationId === data.locationId) {
        activeTooltip.popup.setLngLat(data.coordinates);
        return;
      }

      const content = renderHoverTooltip(data);
      if (!content) return;

      const tooltip = buildTooltip(tooltipRef.current, data.locationId);
      tooltipRef.current = tooltip;
      tooltip.root.render(content);
      tooltip.popup.setLngLat(data.coordinates).addTo(map);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };

    const attachLayerListeners = () => {
      for (const layerId of LAYER_IDS) {
        map.on("mousedown", layerId, handleMouseDown);
        map.on("click", layerId, handleClick);
        map.on("contextmenu", layerId, handleContextMenu);
        map.on("touchstart", layerId, handleTouchStart);
        if (!useHoverListeners) continue;
        map.on("mouseenter", layerId, handleMouseEnter);
        map.on("mousemove", layerId, handleMouseMove);
        map.on("mouseleave", layerId, handleMouseLeave);
      }
      map.on("touchmove", handleTouchMove);
      map.on("touchend", handleTouchEnd);
      map.on("touchcancel", handleTouchEnd);
    };

    const detachLayerListeners = () => {
      for (const layerId of LAYER_IDS) {
        map.off("mousedown", layerId, handleMouseDown);
        map.off("click", layerId, handleClick);
        map.off("contextmenu", layerId, handleContextMenu);
        map.off("touchstart", layerId, handleTouchStart);
        if (!useHoverListeners) continue;
        map.off("mouseenter", layerId, handleMouseEnter);
        map.off("mousemove", layerId, handleMouseMove);
        map.off("mouseleave", layerId, handleMouseLeave);
      }
      map.off("touchmove", handleTouchMove);
      map.off("touchend", handleTouchEnd);
      map.off("touchcancel", handleTouchEnd);
      clearLongPressTimer();
      clearSuppressClickTimer();
      if (useHoverListeners) map.getCanvas().style.cursor = "";
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };

    ensureLayersExist();
    map.on("styledata", ensureLayersExist);
    attachLayerListeners();
    const unsubscribe = onBeforeStyleChange(map, detachLayerListeners);

    const addedImages = addedImagesRef.current;

    return () => {
      map.off("styledata", ensureLayersExist);
      unsubscribe();
      detachLayerListeners();

      try {
        if (map.getStyle() !== undefined) {
          for (const layerId of LAYER_IDS) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
          }
          if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        }
      } catch {}

      addedImages.clear();
      tooltipRef.current = destroyTooltip(tooltipRef.current);
    };
  }, [map, isLoaded, pointStyle, useZabkaMarkers]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    if (lastAppliedDataRef.current?.source === source && lastAppliedDataRef.current.data === geoJSON) return;
    lastAppliedDataRef.current = { source, data: geoJSON };

    if (useZabkaMarkers) syncZabkaImage(map, addedImagesRef.current);
    else if (pointStyle === "markers") syncMarkerImages(map, geoJSON.features, addedImagesRef.current);
    else syncPieImages(map, geoJSON.features, addedImagesRef.current);

    void source.setData(geoJSON);
  }, [map, isLoaded, geoJSON, pointStyle, useZabkaMarkers]);
}
