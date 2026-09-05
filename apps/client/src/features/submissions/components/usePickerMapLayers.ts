import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
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

type LayerConfig = {
  sourceId: string;
  circleLayerId: string;
  symbolLayerId: string;
  layerIds: readonly string[];
};

function ensureMapLayersExist(map: MaplibreMap, config: LayerConfig, imageTracker: Set<string>): void {
  try {
    if (!map.getSource(config.sourceId)) {
      map.addSource(config.sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      imageTracker.clear();
    }

    if (!map.getLayer(config.circleLayerId)) {
      map.addLayer({
        id: config.circleLayerId,
        type: "circle",
        source: config.sourceId,
        filter: ["!", ["get", "isMultiOperator"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
    }

    if (!map.getLayer(config.symbolLayerId)) {
      map.addLayer({
        id: config.symbolLayerId,
        type: "symbol",
        source: config.sourceId,
        filter: ["get", "isMultiOperator"],
        layout: {
          "icon-image": ["get", "pieImageId"],
          "icon-size": 0.5,
          "icon-allow-overlap": true,
        },
      });
    }
  } catch {
    // Layer may not exist
  }
}

function cleanupMapLayers(map: MaplibreMap, config: LayerConfig, imageTracker: Set<string>): void {
  for (const layerId of config.layerIds) {
    try {
      map.removeLayer(layerId);
    } catch {
      // Layer may already be removed
    }
  }

  try {
    map.removeSource(config.sourceId);
  } catch {
    // Source may already be removed
  }

  imageTracker.clear();
}

function attachCursorHandlers(map: MaplibreMap, layerIds: readonly string[]): () => void {
  if (!hasReliableHoverPointer()) return () => {};

  const handleMouseEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };
  const handleMouseLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  const attach = () => {
    for (const layerId of layerIds) {
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);
    }
  };

  const detach = () => {
    for (const layerId of layerIds) {
      map.off("mouseenter", layerId, handleMouseEnter);
      map.off("mouseleave", layerId, handleMouseLeave);
    }
    map.getCanvas().style.cursor = "";
  };

  attach();
  const unsubscribe = onBeforeStyleChange(map, detach);

  return () => {
    detach();
    unsubscribe();
  };
}

type UsePickerMapLayersArgs = {
  map: MaplibreMap | null;
  isLoaded: boolean;
  geoJSON: FeatureCollection;
  ukeGeoJSON: FeatureCollection;
  showUkeLocations: boolean;
};

const PICKER_CONFIG: LayerConfig = {
  sourceId: PICKER_SOURCE_ID,
  circleLayerId: PICKER_CIRCLE_LAYER_ID,
  symbolLayerId: PICKER_SYMBOL_LAYER_ID,
  layerIds: PICKER_LAYER_IDS,
};

const UKE_CONFIG: LayerConfig = {
  sourceId: PICKER_UKE_SOURCE_ID,
  circleLayerId: PICKER_UKE_CIRCLE_LAYER_ID,
  symbolLayerId: PICKER_UKE_SYMBOL_LAYER_ID,
  layerIds: PICKER_UKE_LAYER_IDS,
};

export function usePickerMapLayers({ map, isLoaded, geoJSON, ukeGeoJSON, showUkeLocations }: UsePickerMapLayersArgs): void {
  const addedImagesRef = useRef(new Set<string>());
  const addedUkeImagesRef = useRef(new Set<string>());

  // Setup picker layers (always active)
  useEffect(() => {
    if (!map || !isLoaded) return;

    const imageTracker = addedImagesRef.current;
    const ensureLayers = () => ensureMapLayersExist(map, PICKER_CONFIG, imageTracker);

    ensureLayers();
    map.on("styledata", ensureLayers);
    const cleanupCursor = attachCursorHandlers(map, PICKER_CONFIG.layerIds);

    return () => {
      map.off("styledata", ensureLayers);
      cleanupCursor();
      cleanupMapLayers(map, PICKER_CONFIG, imageTracker);
    };
  }, [map, isLoaded]);

  // Update picker layer data
  useEffect(() => {
    if (!map || !isLoaded) return;
    const source = map.getSource(PICKER_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    syncPieImages(map, geoJSON.features, addedImagesRef.current);
    void source.setData(geoJSON);
  }, [map, isLoaded, geoJSON]);

  // Setup UKE layers (conditional)
  useEffect(() => {
    if (!map || !isLoaded) return;

    const ukeImageTracker = addedUkeImagesRef.current;
    const ensureLayers = () => {
      ensureMapLayersExist(map, UKE_CONFIG, ukeImageTracker);
      // Move picker layers on top after adding UKE layers
      if (map.getLayer(PICKER_CIRCLE_LAYER_ID)) map.moveLayer(PICKER_CIRCLE_LAYER_ID);
      if (map.getLayer(PICKER_SYMBOL_LAYER_ID)) map.moveLayer(PICKER_SYMBOL_LAYER_ID);
    };

    if (showUkeLocations) {
      ensureLayers();
      map.on("styledata", ensureLayers);
      const cleanupCursor = attachCursorHandlers(map, UKE_CONFIG.layerIds);

      return () => {
        map.off("styledata", ensureLayers);
        cleanupCursor();
        cleanupMapLayers(map, UKE_CONFIG, ukeImageTracker);
      };
    }
  }, [map, isLoaded, showUkeLocations]);

  // Update UKE layer data
  useEffect(() => {
    if (!map || !isLoaded || !showUkeLocations) return;
    const source = map.getSource(PICKER_UKE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    syncPieImages(map, ukeGeoJSON.features, addedUkeImagesRef.current);
    void source.setData(ukeGeoJSON);
  }, [map, isLoaded, showUkeLocations, ukeGeoJSON]);
}
