import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { POINT_LAYER_ID } from "@/features/map/constants";

import {
  type TerrainProfileAnalysis,
  type TerrainProfileReceiver,
  type TerrainProfileSample,
  type TerrainProfileStationTarget,
  samplesFromArrays,
} from "../types";

const SOURCE_ID = "terrain-profile-path-source";
const LINE_LAYER_ID = "terrain-profile-path-line";
const HOVER_SOURCE_ID = "terrain-profile-hover-source";
const HOVER_LAYER_ID = "terrain-profile-hover-point";

type FeatureCollection = Extract<Parameters<GeoJSONSource["setData"]>[0], { type: "FeatureCollection" }>;

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

function getSampleCoordinates(samples: TerrainProfileSample[]): [number, number][] {
  return samples.map((sample) => [sample.longitude, sample.latitude]);
}

function buildPathData(
  station: TerrainProfileStationTarget | null,
  receiver: TerrainProfileReceiver | null,
  analysis: TerrainProfileAnalysis | null,
): FeatureCollection {
  const ready = analysis?.status === "ready" ? analysis : null;
  const resolvedStation = analysis?.status === "ready" || analysis?.status === "selection_required" ? analysis.station : null;
  const samples = ready === null ? [] : samplesFromArrays(ready.path.samples);
  const coordinates = samples.length > 1 ? getSampleCoordinates(samples) : null;
  const stationLatitude = resolvedStation?.latitude ?? station?.latitude;
  const stationLongitude = resolvedStation?.longitude ?? station?.longitude;
  const fallbackCoordinates =
    stationLatitude !== undefined && stationLongitude !== undefined && receiver !== null
      ? [
          [stationLongitude, stationLatitude],
          [receiver.longitude, receiver.latitude],
        ]
      : null;
  const lineCoordinates = coordinates ?? fallbackCoordinates;
  if (lineCoordinates === null) return EMPTY_COLLECTION;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { status: ready?.assessment.surface_status ?? "unknown" },
        geometry: { type: "LineString", coordinates: lineCoordinates },
      },
    ],
  };
}

function createLineLayer(): LayerSpecification {
  return {
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": ["match", ["get", "status"], "clear", "#16a34a", "constrained", "#d97706", "blocked", "#dc2626", "#2563eb"],
      "line-width": 4,
      "line-opacity": 0.9,
    },
  };
}

function createHoverLayer(): LayerSpecification {
  return {
    id: HOVER_LAYER_ID,
    type: "circle",
    source: HOVER_SOURCE_ID,
    paint: {
      "circle-radius": 6,
      "circle-color": "#ffffff",
      "circle-stroke-color": "#2563eb",
      "circle-stroke-width": 3,
    },
  };
}

function setSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection) {
  void (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}

type UseTerrainProfileLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  enabled: boolean;
  station: TerrainProfileStationTarget | null;
  receiver: TerrainProfileReceiver | null;
  analysis: TerrainProfileAnalysis | null;
};

export function useTerrainProfileLayer({ map, isLoaded, enabled, station, receiver, analysis }: UseTerrainProfileLayerArgs) {
  const pathData = useMemo(() => buildPathData(station, receiver, analysis), [analysis, receiver, station]);
  const pathDataRef = useRef(pathData);

  useEffect(() => {
    pathDataRef.current = pathData;
  }, [pathData]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    const ensureLayersExist = () => {
      try {
        const beforeLayer = map.getLayer(POINT_LAYER_ID) ? POINT_LAYER_ID : undefined;
        if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: "geojson", data: pathDataRef.current });
        if (!map.getSource(HOVER_SOURCE_ID)) map.addSource(HOVER_SOURCE_ID, { type: "geojson", data: EMPTY_COLLECTION });
        if (!map.getLayer(LINE_LAYER_ID)) map.addLayer(createLineLayer(), beforeLayer);
        if (!map.getLayer(HOVER_LAYER_ID)) map.addLayer(createHoverLayer());
      } catch {}
    };
    ensureLayersExist();
    map.on("styledata", ensureLayersExist);
    return () => {
      map.off("styledata", ensureLayersExist);
      try {
        if (map.getLayer(HOVER_LAYER_ID)) map.removeLayer(HOVER_LAYER_ID);
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getSource(HOVER_SOURCE_ID)) map.removeSource(HOVER_SOURCE_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {}
    };
  }, [enabled, isLoaded, map]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    setSourceData(map, SOURCE_ID, pathData);
    setSourceData(map, HOVER_SOURCE_ID, EMPTY_COLLECTION);
  }, [enabled, isLoaded, map, pathData]);

  const setHoveredSample = useCallback(
    (hoveredSample: TerrainProfileSample | null) => {
      if (!map || !isLoaded || !enabled) return;
      const data: FeatureCollection =
        hoveredSample === null
          ? EMPTY_COLLECTION
          : {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: [hoveredSample.longitude, hoveredSample.latitude] },
                },
              ],
            };
      setSourceData(map, HOVER_SOURCE_ID, data);
    },
    [enabled, isLoaded, map],
  );

  return setHoveredSample;
}
