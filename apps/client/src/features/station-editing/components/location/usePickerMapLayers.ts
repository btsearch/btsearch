import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { onBeforeStyleChange } from "@/components/ui/map";
import {
  PICKER_CIRCLE_LAYER_ID,
  PICKER_LAYER_IDS,
  PICKER_SOURCE_ID,
  PICKER_SYMBOL_LAYER_ID,
  PICKER_UKE_CIRCLE_LAYER_ID,
  PICKER_UKE_LAYER_IDS,
  PICKER_UKE_SOURCE_ID,
  PICKER_UKE_SYMBOL_LAYER_ID,
} from "@/features/map/constants";
import { syncPieImages } from "@/features/map/pieChart";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";

type LayerSet = {
  sourceId: string;
  circleLayerId: string;
  symbolLayerId: string;
  layerIds: readonly string[];
};

type LayerSetArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  layers: LayerSet;
  data: FeatureCollection;
  isShown: boolean;
  onLayersAdded?: (map: MapLibreMap) => void;
};

type PickerMapLayersArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  places: FeatureCollection;
  registerPlaces: FeatureCollection;
  showsRegister: boolean;
};

const PLACE_LAYERS: LayerSet = {
  sourceId: PICKER_SOURCE_ID,
  circleLayerId: PICKER_CIRCLE_LAYER_ID,
  symbolLayerId: PICKER_SYMBOL_LAYER_ID,
  layerIds: PICKER_LAYER_IDS,
};
const REGISTER_LAYERS: LayerSet = {
  sourceId: PICKER_UKE_SOURCE_ID,
  circleLayerId: PICKER_UKE_CIRCLE_LAYER_ID,
  symbolLayerId: PICKER_UKE_SYMBOL_LAYER_ID,
  layerIds: PICKER_UKE_LAYER_IDS,
};
const NO_FEATURES: FeatureCollection = { type: "FeatureCollection", features: [] };
const POINT_RADIUS = 6;
const POINT_STROKE_WIDTH = 2;
const POINT_STROKE_COLOR = "#fff";
const PIE_IMAGE_SCALE = 0.5;

function addLayerSet(map: MapLibreMap, layers: LayerSet, knownImages: Set<string>): boolean {
  let hasAddedLayer = false;

  try {
    if (!map.getSource(layers.sourceId)) {
      map.addSource(layers.sourceId, { type: "geojson", data: NO_FEATURES });
      knownImages.clear();
    }

    if (!map.getLayer(layers.circleLayerId)) {
      map.addLayer({
        id: layers.circleLayerId,
        type: "circle",
        source: layers.sourceId,
        filter: ["!", ["get", "isMultiOperator"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": POINT_RADIUS,
          "circle-stroke-width": POINT_STROKE_WIDTH,
          "circle-stroke-color": POINT_STROKE_COLOR,
        },
      });
      hasAddedLayer = true;
    }

    if (!map.getLayer(layers.symbolLayerId)) {
      map.addLayer({
        id: layers.symbolLayerId,
        type: "symbol",
        source: layers.sourceId,
        filter: ["get", "isMultiOperator"],
        layout: {
          "icon-image": ["get", "pieImageId"],
          "icon-size": PIE_IMAGE_SCALE,
          "icon-allow-overlap": true,
        },
      });
      hasAddedLayer = true;
    }
  } catch {}
  return hasAddedLayer;
}

function removeLayerSet(map: MapLibreMap, layers: LayerSet, knownImages: Set<string>): void {
  for (const layerId of layers.layerIds) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {}
  }

  try {
    if (map.getSource(layers.sourceId)) map.removeSource(layers.sourceId);
  } catch {}

  knownImages.clear();
}

function raisePlaceLayers(map: MapLibreMap): void {
  try {
    for (const layerId of PLACE_LAYERS.layerIds) if (map.getLayer(layerId)) map.moveLayer(layerId);
  } catch {}
}

function showLayerData(map: MapLibreMap, layers: LayerSet, data: FeatureCollection, knownImages: Set<string>): void {
  const source = map.getSource(layers.sourceId) as GeoJSONSource | undefined;
  if (source === undefined) return;

  syncPieImages(map, data.features, knownImages);
  void source.setData(data);
}

function attachPointerCursor(map: MapLibreMap, layerIds: readonly string[]): () => void {
  if (!hasReliableHoverPointer()) return () => {};

  function showPointer() {
    map.getCanvas().style.cursor = "pointer";
  }

  function resetCursor() {
    map.getCanvas().style.cursor = "";
  }

  function detach() {
    for (const layerId of layerIds) {
      map.off("mouseenter", layerId, showPointer);
      map.off("mouseleave", layerId, resetCursor);
    }
    resetCursor();
  }

  for (const layerId of layerIds) {
    map.on("mouseenter", layerId, showPointer);
    map.on("mouseleave", layerId, resetCursor);
  }
  const stopWatchingStyle = onBeforeStyleChange(map, detach);

  return () => {
    detach();
    stopWatchingStyle();
  };
}

function useLayerSet({ map, isLoaded, layers, data, isShown, onLayersAdded }: LayerSetArgs): void {
  const knownImagesRef = useRef(new Set<string>());

  useEffect(() => {
    if (map === null || !isLoaded || !isShown) return;

    const knownImages = knownImagesRef.current;
    const addLayers = () => {
      if (addLayerSet(map, layers, knownImages)) onLayersAdded?.(map);
    };

    addLayers();
    map.on("styledata", addLayers);
    const detachCursor = attachPointerCursor(map, layers.layerIds);

    return () => {
      map.off("styledata", addLayers);
      detachCursor();
      removeLayerSet(map, layers, knownImages);
    };
  }, [map, isLoaded, isShown, layers, onLayersAdded]);

  useEffect(() => {
    if (map === null || !isLoaded || !isShown) return;
    showLayerData(map, layers, data, knownImagesRef.current);
  }, [map, isLoaded, isShown, layers, data]);
}

export function usePickerMapLayers({ map, isLoaded, places, registerPlaces, showsRegister }: PickerMapLayersArgs): void {
  useLayerSet({ map, isLoaded, layers: PLACE_LAYERS, data: places, isShown: true });
  useLayerSet({ map, isLoaded, layers: REGISTER_LAYERS, data: registerPlaces, isShown: showsRegister, onLayersAdded: raisePlaceLayers });
}
