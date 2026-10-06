import { destinationPoint } from "@openbts/shared/radiolinesUtils";
import { ANTENNA_AZIMUTH_TOLERANCE_DEG } from "@openbts/shared/terrainProfile";
import type { GeoJSONSource, LayerSpecification, MapLayerMouseEvent, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef } from "react";

import type { HoveredDistanceStore } from "../hoveredDistance";
import { type ProfileSummary, type SampleRun, findNearestSampleIndex } from "../profileSummary";
import { getPathDistanceMeters } from "../receiverRange";
import type { GeoPoint, ReadyTerrainProfile, TerrainSample } from "../types";
import { type TerrainPathVerdict, getTerrainPathVerdict } from "../verdict";
import { onBeforeStyleChange, useResolvedTheme } from "@/components/ui/map";
import { POINT_LAYER_ID } from "@/features/map/constants";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";

type FeatureCollection = Extract<Parameters<GeoJSONSource["setData"]>[0], { type: "FeatureCollection" }>;
type Feature = FeatureCollection["features"][number];
type Position = [number, number];
type SceneLayer = { spec: LayerSpecification; isBelowStations: boolean };

type MapScene = {
  station: GeoPoint;
  receiverPoint: GeoPoint | null;
  profile: ReadyTerrainProfile | null;
  summary: ProfileSummary | null;
  wedgeAzimuth: number | null;
  brandColor: string;
};

type UseTerrainProfileLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  station: GeoPoint | null;
  receiverPoint: GeoPoint | null;
  profile: ReadyTerrainProfile | null;
  summary: ProfileSummary | null;
  wedgeAzimuth: number | null;
  brandColor: string;
  isPickingReceiver: boolean;
  hover: HoveredDistanceStore;
  onPlaceReceiver: (point: GeoPoint) => void;
};

const WEDGE_SOURCE_ID = "terrain-profile-wedge-source";
const PATH_SOURCE_ID = "terrain-profile-path-source";
const BLOCKED_SOURCE_ID = "terrain-profile-blocked-source";
const STATION_SOURCE_ID = "terrain-profile-station-source";
const HOVER_SOURCE_ID = "terrain-profile-hover-source";
const SCENE_SOURCE_IDS = [WEDGE_SOURCE_ID, PATH_SOURCE_ID, BLOCKED_SOURCE_ID, STATION_SOURCE_ID] as const;
const PATH_HITBOX_LAYER_ID = "terrain-profile-path-hitbox";

type SceneData = Record<(typeof SCENE_SOURCE_IDS)[number], FeatureCollection>;

const PRIMARY_COLOR_VARIABLE = "--primary";
const FALLBACK_PRIMARY_COLOR = "#2563eb";
const PATH_CASING_COLOR = "#070b0d";
const BLOCKED_COLOR = "#dc2626";
const VERDICT_PATH_COLORS: Record<TerrainPathVerdict, string> = { clear: "#16a34a", blocked: BLOCKED_COLOR, unavailable: "#64748b" };
const PICKING_CURSOR_CLASS = "cursor-crosshair!";
const WEDGE_ARC_SEGMENT_DEGREES = 4;
const WEDGE_PATH_SHARE = 0.25;
const WEDGE_MIN_RADIUS_METERS = 150;
const WEDGE_MAX_RADIUS_METERS = 3000;

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_SCENE_DATA: SceneData = {
  [WEDGE_SOURCE_ID]: EMPTY_COLLECTION,
  [PATH_SOURCE_ID]: EMPTY_COLLECTION,
  [BLOCKED_SOURCE_ID]: EMPTY_COLLECTION,
  [STATION_SOURCE_ID]: EMPTY_COLLECTION,
};

const SCENE_LAYERS: SceneLayer[] = [
  {
    spec: {
      id: "terrain-profile-wedge-fill",
      type: "fill",
      source: WEDGE_SOURCE_ID,
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.16 },
    },
    isBelowStations: true,
  },
  {
    spec: {
      id: "terrain-profile-wedge-outline",
      type: "line",
      source: WEDGE_SOURCE_ID,
      paint: { "line-color": ["get", "color"], "line-opacity": 0.6, "line-width": 1 },
    },
    isBelowStations: true,
  },
  {
    spec: {
      id: "terrain-profile-path-casing",
      type: "line",
      source: PATH_SOURCE_ID,
      layout: { "line-cap": "round" },
      paint: { "line-color": PATH_CASING_COLOR, "line-opacity": 0.85, "line-width": 7 },
    },
    isBelowStations: true,
  },
  {
    spec: {
      id: "terrain-profile-path-line",
      type: "line",
      source: PATH_SOURCE_ID,
      paint: {
        "line-color": ["get", "color"],
        "line-width": 4,
        "line-dasharray": ["case", ["get", "isPending"], ["literal", [2, 1.75]], ["literal", [1, 0]]],
      },
    },
    isBelowStations: true,
  },
  {
    spec: {
      id: "terrain-profile-blocked-line",
      type: "line",
      source: BLOCKED_SOURCE_ID,
      layout: { "line-cap": "round" },
      paint: { "line-color": BLOCKED_COLOR, "line-width": 6 },
    },
    isBelowStations: true,
  },
  {
    spec: { id: PATH_HITBOX_LAYER_ID, type: "line", source: PATH_SOURCE_ID, paint: { "line-width": 18, "line-opacity": 0 } },
    isBelowStations: true,
  },
  {
    spec: {
      id: "terrain-profile-station-ring-casing",
      type: "circle",
      source: STATION_SOURCE_ID,
      paint: {
        "circle-radius": 13,
        "circle-opacity": 0,
        "circle-stroke-color": PATH_CASING_COLOR,
        "circle-stroke-opacity": 0.7,
        "circle-stroke-width": 4,
      },
    },
    isBelowStations: false,
  },
  {
    spec: {
      id: "terrain-profile-station-ring",
      type: "circle",
      source: STATION_SOURCE_ID,
      paint: { "circle-radius": 13, "circle-opacity": 0, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
    },
    isBelowStations: false,
  },
  {
    spec: {
      id: "terrain-profile-hover-point",
      type: "circle",
      source: HOVER_SOURCE_ID,
      paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 3 },
    },
    isBelowStations: false,
  },
];

function toPosition(point: GeoPoint): Position {
  return [point.longitude, point.latitude];
}

function getMidpoint(left: TerrainSample, right: TerrainSample): Position {
  return [(left.longitude + right.longitude) / 2, (left.latitude + right.latitude) / 2];
}

function readPrimaryColor(): string {
  const declaredColor = getComputedStyle(document.documentElement).getPropertyValue(PRIMARY_COLOR_VARIABLE).trim();
  const context = document.createElement("canvas").getContext("2d");
  if (declaredColor === "" || context === null) return FALLBACK_PRIMARY_COLOR;

  context.fillStyle = FALLBACK_PRIMARY_COLOR;
  context.fillStyle = declaredColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${red}, ${green}, ${blue})`;
}

function buildWedgeData({ station, receiverPoint, wedgeAzimuth, brandColor }: MapScene): FeatureCollection {
  if (wedgeAzimuth === null || receiverPoint === null) return EMPTY_COLLECTION;

  const pathShare = getPathDistanceMeters(station, receiverPoint) * WEDGE_PATH_SHARE;
  const radius = Math.min(WEDGE_MAX_RADIUS_METERS, Math.max(WEDGE_MIN_RADIUS_METERS, pathShare));
  const wedgeAngle = ANTENNA_AZIMUTH_TOLERANCE_DEG * 2;
  const firstAngle = wedgeAzimuth - ANTENNA_AZIMUTH_TOLERANCE_DEG;
  const segmentCount = Math.ceil(wedgeAngle / WEDGE_ARC_SEGMENT_DEGREES);
  const arc = Array.from({ length: segmentCount + 1 }, (_, index): Position => {
    const [latitude, longitude] = destinationPoint(station.latitude, station.longitude, firstAngle + (wedgeAngle * index) / segmentCount, radius);
    return [longitude, latitude];
  });
  const wedge: Feature = {
    type: "Feature",
    properties: { color: brandColor },
    geometry: { type: "Polygon", coordinates: [[toPosition(station), ...arc, toPosition(station)]] },
  };

  return { type: "FeatureCollection", features: [wedge] };
}

function toLineFeature(coordinates: Position[], properties: Feature["properties"]): Feature {
  return { type: "Feature", properties, geometry: { type: "LineString", coordinates } };
}

function buildPathData(coordinates: Position[], color: string, isPending: boolean): FeatureCollection {
  return { type: "FeatureCollection", features: [toLineFeature(coordinates, { color, isPending })] };
}

function buildScenePathData({ station, receiverPoint, profile }: MapScene, primaryColor: string): FeatureCollection {
  if (receiverPoint === null) return EMPTY_COLLECTION;

  const samples = profile?.result.samples ?? [];
  if (profile === null || samples.length < 2) return buildPathData([toPosition(station), toPosition(receiverPoint)], primaryColor, true);
  return buildPathData(samples.map(toPosition), VERDICT_PATH_COLORS[getTerrainPathVerdict(profile.result)], false);
}

function listRunPositions(samples: readonly TerrainSample[], { firstIndex, lastIndex }: SampleRun): Position[] {
  const positions = samples.slice(firstIndex, lastIndex + 1).map(toPosition);
  if (firstIndex > 0) positions.unshift(getMidpoint(samples[firstIndex - 1], samples[firstIndex]));
  if (lastIndex < samples.length - 1) positions.push(getMidpoint(samples[lastIndex], samples[lastIndex + 1]));
  return positions;
}

function buildBlockedData({ profile, summary }: MapScene): FeatureCollection {
  if (profile === null || summary === null) return EMPTY_COLLECTION;
  const { samples } = profile.result;
  const stretches = summary.blockedRuns.map((run) => listRunPositions(samples, run)).filter((positions) => positions.length > 1);

  return { type: "FeatureCollection", features: stretches.map((coordinates) => toLineFeature(coordinates, {})) };
}

function buildPointData(point: GeoPoint, color: string): FeatureCollection {
  const feature: Feature = { type: "Feature", properties: { color }, geometry: { type: "Point", coordinates: toPosition(point) } };
  return { type: "FeatureCollection", features: [feature] };
}

function buildSceneData(scene: MapScene, primaryColor: string): SceneData {
  return {
    [WEDGE_SOURCE_ID]: buildWedgeData(scene),
    [PATH_SOURCE_ID]: buildScenePathData(scene, primaryColor),
    [BLOCKED_SOURCE_ID]: buildBlockedData(scene),
    [STATION_SOURCE_ID]: buildPointData(scene.station, primaryColor),
  };
}

function setSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection): void {
  void (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}

function applySceneData(map: MapLibreMap, data: SceneData): void {
  for (const sourceId of SCENE_SOURCE_IDS) setSourceData(map, sourceId, data[sourceId]);
}

function ensureSceneLayers(map: MapLibreMap, data: SceneData): void {
  for (const sourceId of SCENE_SOURCE_IDS) {
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "geojson", data: data[sourceId] });
  }
  if (!map.getSource(HOVER_SOURCE_ID)) map.addSource(HOVER_SOURCE_ID, { type: "geojson", data: EMPTY_COLLECTION });

  const stationsLayerId = map.getLayer(POINT_LAYER_ID) ? POINT_LAYER_ID : undefined;
  for (const { spec, isBelowStations } of SCENE_LAYERS) {
    if (!map.getLayer(spec.id)) map.addLayer(spec, isBelowStations ? stationsLayerId : undefined);
  }
}

function removeSceneLayers(map: MapLibreMap): void {
  try {
    for (const { spec } of SCENE_LAYERS) if (map.getLayer(spec.id)) map.removeLayer(spec.id);
    for (const sourceId of [...SCENE_SOURCE_IDS, HOVER_SOURCE_ID]) if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {}
}

function getPathShare(map: MapLibreMap, station: GeoPoint, receiverPoint: GeoPoint, pointer: { x: number; y: number }): number | null {
  const start = map.project(toPosition(station));
  const end = map.project(toPosition(receiverPoint));
  const spanX = end.x - start.x;
  const spanY = end.y - start.y;
  const spanSquared = spanX * spanX + spanY * spanY;
  if (spanSquared === 0) return null;

  const share = ((pointer.x - start.x) * spanX + (pointer.y - start.y) * spanY) / spanSquared;
  return Math.min(1, Math.max(0, share));
}

export function useTerrainProfileLayer({
  map,
  isLoaded,
  station,
  receiverPoint,
  profile,
  summary,
  wedgeAzimuth,
  brandColor,
  isPickingReceiver,
  hover,
  onPlaceReceiver,
}: UseTerrainProfileLayerArgs) {
  const theme = useResolvedTheme();
  const sceneDataRef = useRef(EMPTY_SCENE_DATA);
  const primaryColorRef = useRef(FALLBACK_PRIMARY_COLOR);
  const latestRef = useRef({ station, onPlaceReceiver });
  const isEnabled = station !== null;

  useEffect(() => {
    latestRef.current = { station, onPlaceReceiver };
  }, [onPlaceReceiver, station]);

  useEffect(() => {
    if (!map || !isLoaded || !isEnabled) return;

    const ensureLayersExist = () => {
      try {
        ensureSceneLayers(map, sceneDataRef.current);
      } catch {}
    };

    ensureLayersExist();
    map.on("styledata", ensureLayersExist);

    return () => {
      map.off("styledata", ensureLayersExist);
      removeSceneLayers(map);
      sceneDataRef.current = EMPTY_SCENE_DATA;
    };
  }, [isEnabled, isLoaded, map]);

  useEffect(() => {
    if (!map || !isLoaded || station === null) return;

    const primaryColor = readPrimaryColor();
    const sceneData = buildSceneData({ station, receiverPoint, profile, summary, wedgeAzimuth, brandColor }, primaryColor);
    primaryColorRef.current = primaryColor;
    sceneDataRef.current = sceneData;
    applySceneData(map, sceneData);
  }, [brandColor, isLoaded, map, profile, receiverPoint, station, summary, theme, wedgeAzimuth]);

  useEffect(() => {
    if (!map || !isLoaded || !isEnabled) return;

    const showHoveredPoint = () => {
      const hovered = hover.get();
      const samples = profile?.result.samples ?? [];
      const sampleIndex = hovered === null ? null : findNearestSampleIndex(samples, hovered.distanceMeters);
      const data = sampleIndex === null ? EMPTY_COLLECTION : buildPointData(samples[sampleIndex], primaryColorRef.current);
      setSourceData(map, HOVER_SOURCE_ID, data);
    };

    showHoveredPoint();
    return hover.subscribe(showHoveredPoint);
  }, [hover, isEnabled, isLoaded, map, profile, theme]);

  useEffect(() => {
    if (!map || !isLoaded || station === null || receiverPoint === null || profile === null || !hasReliableHoverPointer()) return;

    const pathDistanceMeters = profile.result.distanceMeters;
    const followPointer = (event: MapLayerMouseEvent) => {
      const share = getPathShare(map, station, receiverPoint, event.point);
      if (share !== null) hover.set({ distanceMeters: share * pathDistanceMeters, source: "map" });
    };
    const releasePointer = () => hover.release("map");
    const detachPathListeners = () => {
      map.off("mousemove", PATH_HITBOX_LAYER_ID, followPointer);
      map.off("mouseleave", PATH_HITBOX_LAYER_ID, releasePointer);
    };

    map.on("mousemove", PATH_HITBOX_LAYER_ID, followPointer);
    map.on("mouseleave", PATH_HITBOX_LAYER_ID, releasePointer);
    const unsubscribe = onBeforeStyleChange(map, detachPathListeners);

    return () => {
      unsubscribe();
      detachPathListeners();
      hover.release("map");
    };
  }, [hover, isLoaded, map, profile, receiverPoint, station]);

  useEffect(() => {
    if (!map || !isLoaded || !isPickingReceiver) return;

    const canvas = map.getCanvas();
    const placeAtClick = (event: MapMouseEvent) => {
      if (event.originalEvent.target !== canvas) return;
      latestRef.current.onPlaceReceiver({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    };

    canvas.classList.add(PICKING_CURSOR_CLASS);
    map.on("click", placeAtClick);

    return () => {
      map.off("click", placeAtClick);
      canvas.classList.remove(PICKING_CURSOR_CLASS);
    };
  }, [isLoaded, isPickingReceiver, map]);

  const previewReceiver = useCallback(
    (point: GeoPoint) => {
      const currentStation = latestRef.current.station;
      if (!map || !isLoaded || currentStation === null) return;
      setSourceData(map, PATH_SOURCE_ID, buildPathData([toPosition(currentStation), toPosition(point)], primaryColorRef.current, true));
      setSourceData(map, BLOCKED_SOURCE_ID, EMPTY_COLLECTION);
    },
    [isLoaded, map],
  );

  return { previewReceiver };
}
