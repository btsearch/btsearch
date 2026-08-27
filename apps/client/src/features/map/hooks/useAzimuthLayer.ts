import { getOperatorColor } from "@openbts/shared/operatorUtils";
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";

import type { LocationWithStations, UkeLocationWithPermits } from "@/types/station";

import {
  INTERNAL_AZIMUTHS_FILL_LAYER_ID,
  INTERNAL_AZIMUTHS_LABEL_LAYER_ID,
  INTERNAL_AZIMUTHS_LABEL_SOURCE_ID,
  INTERNAL_AZIMUTHS_OUTLINE_LAYER_ID,
  INTERNAL_AZIMUTHS_OUTLINE_SOURCE_ID,
  INTERNAL_AZIMUTHS_SOURCE_ID,
  POINT_LAYER_ID,
  UKE_AZIMUTHS_FILL_LAYER_ID,
  UKE_AZIMUTHS_LABEL_LAYER_ID,
  UKE_AZIMUTHS_LABEL_SOURCE_ID,
  UKE_AZIMUTHS_OUTLINE_LAYER_ID,
  UKE_AZIMUTHS_OUTLINE_SOURCE_ID,
  UKE_AZIMUTHS_SOURCE_ID,
} from "../constants";
import { DEFAULT_COLOR } from "../geojson";
import { destinationPoint } from "../utils";

type GeoJsonGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: Coordinates }
  | { type: "Polygon"; coordinates: Coordinates[] };
type GeoJsonFeature = { type: "Feature"; properties: Record<string, unknown>; geometry: GeoJsonGeometry };
type GeoJsonFeatureCollection = { type: "FeatureCollection"; features: GeoJsonFeature[] };

const EMPTY_GEOJSON: GeoJsonFeatureCollection = { type: "FeatureCollection", features: [] };

type AzimuthPoint = { latitude: number; longitude: number; entries: { azimuth: number; color: string }[] };

type AzimuthFeatures = {
  fills: GeoJsonFeature[];
  outlines: GeoJsonFeature[];
  labels: GeoJsonFeature[];
};

type Coordinates = [number, number][];
type LineLayerSpecification = Extract<LayerSpecification, { type: "line" }>;
type LineLayerPaint = NonNullable<LineLayerSpecification["paint"]>;

const AZIMUTH_ARC_SEGMENT_DEGREES = 4;
const OMNIDIRECTIONAL_AZIMUTH = 360;
const FULL_CIRCLE_DEGREES = 360;
const OMNIDIRECTIONAL_RADIUS_SCALE = 0.5;

function hasAzimuth<T extends { azimuth: number | null | undefined }>(sector: T): sector is T & { azimuth: number } {
  return sector.azimuth !== null && sector.azimuth !== undefined;
}

function buildAzimuthArcCoordinates(lat: number, lng: number, startAngle: number, endAngle: number, lineLength: number): [number, number][] {
  const angleSpan = endAngle - startAngle;
  const segmentCount = Math.max(1, Math.ceil(Math.abs(angleSpan) / AZIMUTH_ARC_SEGMENT_DEGREES));
  const arcCoordinates: [number, number][] = [];

  for (let i = 0; i <= segmentCount; i++) {
    const angle = startAngle + (angleSpan * i) / segmentCount;
    const [pointLat, pointLng] = destinationPoint(lat, lng, angle, lineLength);
    arcCoordinates.push([pointLng, pointLat]);
  }

  return arcCoordinates;
}

function buildOmnidirectionalCircleCoordinates(lat: number, lng: number, lineLength: number): Coordinates {
  const coordinates = buildAzimuthArcCoordinates(lat, lng, 0, FULL_CIRCLE_DEGREES, lineLength);
  const first = coordinates[0];
  if (first === undefined) return coordinates;
  return [...coordinates, first];
}

function groupColorsByAzimuth(entries: AzimuthPoint["entries"], dedupeColors: boolean): Map<number, string[]> {
  const azimuthColors = new Map<number, string[]>();

  for (const { azimuth, color } of entries) {
    const existing = azimuthColors.get(azimuth);
    if (!existing) {
      azimuthColors.set(azimuth, [color]);
      continue;
    }

    if (!dedupeColors || !existing.includes(color)) existing.push(color);
  }

  return azimuthColors;
}

function createPolygonFeature(coordinates: Coordinates, color: string, shape = "directional"): GeoJsonFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
    properties: { color, shape },
  };
}

function createLineFeature(coordinates: Coordinates, azimuth: number, color: string, shape = "directional"): GeoJsonFeature {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: { azimuth, color, shape },
  };
}

function createLabelFeature(lat: number, lng: number, azimuth: number, lineLength: number): GeoJsonFeature {
  const [labelLat, labelLng] = destinationPoint(lat, lng, azimuth, lineLength * 0.55);
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [labelLng, labelLat] },
    properties: { label: `${azimuth}°` },
  };
}

function appendOmnidirectionalFeatures(
  fills: GeoJsonFeature[],
  outlines: GeoJsonFeature[],
  labels: GeoJsonFeature[],
  lat: number,
  lng: number,
  colors: string[],
  lineLength: number,
): void {
  const omnidirectionalLength = lineLength * OMNIDIRECTIONAL_RADIUS_SCALE;
  const outlineCoordinates = buildOmnidirectionalCircleCoordinates(lat, lng, omnidirectionalLength);
  outlines.push(createLineFeature(outlineCoordinates, OMNIDIRECTIONAL_AZIMUTH, colors[0] ?? DEFAULT_COLOR, "omnidirectional"));

  if (colors.length === 1) {
    fills.push(createPolygonFeature(outlineCoordinates, colors[0], "omnidirectional"));
    labels.push(createLabelFeature(lat, lng, OMNIDIRECTIONAL_AZIMUTH, omnidirectionalLength));
    return;
  }

  const fillAngle = FULL_CIRCLE_DEGREES / colors.length;
  for (let i = 0; i < colors.length; i++) {
    const fillStartAngle = i * fillAngle;
    const fillEndAngle = (i + 1) * fillAngle;
    const fillArcCoordinates = buildAzimuthArcCoordinates(lat, lng, fillStartAngle, fillEndAngle, omnidirectionalLength);
    fills.push(createPolygonFeature([[lng, lat], ...fillArcCoordinates, [lng, lat]], colors[i], "omnidirectional"));
  }

  labels.push(createLabelFeature(lat, lng, OMNIDIRECTIONAL_AZIMUTH, omnidirectionalLength));
}

function buildOmnidirectionalFeatures(points: AzimuthPoint[], lineLength: number): AzimuthFeatures {
  const fills: GeoJsonFeature[] = [];
  const outlines: GeoJsonFeature[] = [];
  const labels: GeoJsonFeature[] = [];

  for (const { latitude: lat, longitude: lng, entries } of points) {
    if (entries.length === 0) continue;

    const azimuthColors = groupColorsByAzimuth(entries, true);
    const colors = azimuthColors.get(OMNIDIRECTIONAL_AZIMUTH);
    if (colors === undefined) continue;
    appendOmnidirectionalFeatures(fills, outlines, labels, lat, lng, colors, lineLength);
  }

  return { fills, outlines, labels };
}

function buildAzimuthFeatures(points: AzimuthPoint[], lineLength: number, triangleHalfAngle: number): AzimuthFeatures {
  const fills: GeoJsonFeature[] = [];
  const outlines: GeoJsonFeature[] = [];
  const labels: GeoJsonFeature[] = [];

  for (const { latitude: lat, longitude: lng, entries } of points) {
    if (entries.length === 0) continue;

    const azimuthColors = groupColorsByAzimuth(entries, true);
    for (const [azimuth, colors] of azimuthColors) {
      if (azimuth === OMNIDIRECTIONAL_AZIMUTH) {
        appendOmnidirectionalFeatures(fills, outlines, labels, lat, lng, colors, lineLength);
        continue;
      }

      const startAngle = azimuth - triangleHalfAngle;
      const endAngle = azimuth + triangleHalfAngle;
      const wedgeAngle = (triangleHalfAngle * 2) / colors.length;

      const outlineArcCoordinates = buildAzimuthArcCoordinates(lat, lng, startAngle, endAngle, lineLength);
      outlines.push(createPolygonFeature([[lng, lat], ...outlineArcCoordinates, [lng, lat]], colors[0]));

      for (let i = 0; i < colors.length; i++) {
        const fillStartAngle = startAngle + i * wedgeAngle;
        const fillEndAngle = startAngle + (i + 1) * wedgeAngle;
        const fillArcCoordinates = buildAzimuthArcCoordinates(lat, lng, fillStartAngle, fillEndAngle, lineLength);
        fills.push(createPolygonFeature([[lng, lat], ...fillArcCoordinates, [lng, lat]], colors[i]));
      }

      labels.push(createLabelFeature(lat, lng, azimuth, lineLength));
    }
  }

  return { fills, outlines, labels };
}

function buildAzimuthLineFeatures(points: AzimuthPoint[], lineLength: number): GeoJsonFeature[] {
  const features: GeoJsonFeature[] = [];

  for (const { latitude: lat, longitude: lng, entries } of points) {
    if (entries.length === 0) continue;

    const azimuthColors = groupColorsByAzimuth(entries, false);
    for (const [azimuth, colorList] of azimuthColors) {
      if (azimuth === OMNIDIRECTIONAL_AZIMUTH) continue;

      const uniqueColors = [...new Set(colorList)];

      if (uniqueColors.length === 1) {
        const [destLat, destLng] = destinationPoint(lat, lng, azimuth, lineLength);
        features.push(
          createLineFeature(
            [
              [lng, lat],
              [destLng, destLat],
            ],
            azimuth,
            uniqueColors[0],
          ),
        );
        continue;
      }

      const totalSegments = uniqueColors.length * 4;
      for (let i = 0; i < totalSegments; i++) {
        const [startLat, startLng] = destinationPoint(lat, lng, azimuth, (i / totalSegments) * lineLength);
        const [endLat, endLng] = destinationPoint(lat, lng, azimuth, ((i + 1) / totalSegments) * lineLength);
        features.push(
          createLineFeature(
            [
              [startLng, startLat],
              [endLng, endLat],
            ],
            azimuth,
            uniqueColors[i % uniqueColors.length],
          ),
        );
      }
    }
  }

  return features;
}

function ukeLocationsToAzimuthPoints(locations: UkeLocationWithPermits[]): AzimuthPoint[] {
  return locations.map((loc) => ({
    latitude: loc.latitude,
    longitude: loc.longitude,
    entries: (loc.stations ?? []).flatMap((station) => {
      const color = station.operator?.mnc ? getOperatorColor(station.operator.mnc) : DEFAULT_COLOR;
      return (station.permits ?? []).flatMap((permit) =>
        (permit.sectors ?? []).filter(hasAzimuth).map((sector) => ({ azimuth: sector.azimuth, color })),
      );
    }),
  }));
}

function internalLocationsToAzimuthPoints(locations: LocationWithStations[]): AzimuthPoint[] {
  return locations.map((loc) => ({
    latitude: loc.latitude,
    longitude: loc.longitude,
    entries: (loc.stations ?? []).flatMap((station) => {
      const color = station.operator?.mnc ? getOperatorColor(station.operator.mnc) : DEFAULT_COLOR;
      return (station.sectors ?? []).map((sector) => ({ azimuth: sector.azimuth, color }));
    }),
  }));
}

type GeoJSONTriple = {
  fill: GeoJsonFeatureCollection;
  outline: GeoJsonFeatureCollection;
  label: GeoJsonFeatureCollection;
};

function makeGeoJSONTriple(points: AzimuthPoint[], lineLength: number, triangleHalfAngle: number): GeoJSONTriple {
  if (triangleHalfAngle === 0) {
    const omniFeatures = buildOmnidirectionalFeatures(points, lineLength);
    return {
      fill: { type: "FeatureCollection", features: omniFeatures.fills },
      outline: { type: "FeatureCollection", features: [...buildAzimuthLineFeatures(points, lineLength), ...omniFeatures.outlines] },
      label: { type: "FeatureCollection", features: omniFeatures.labels },
    };
  }

  const { fills, outlines, labels } = buildAzimuthFeatures(points, lineLength, triangleHalfAngle);
  return {
    fill: { type: "FeatureCollection", features: fills },
    outline: { type: "FeatureCollection", features: outlines },
    label: { type: "FeatureCollection", features: labels },
  };
}

const EMPTY_TRIPLE: GeoJSONTriple = { fill: EMPTY_GEOJSON, outline: EMPTY_GEOJSON, label: EMPTY_GEOJSON };

function createFillLayerConfig(id: string, sourceId: string, minzoom: number): LayerSpecification {
  return {
    id,
    type: "fill",
    source: sourceId,
    minzoom,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.15, 17, 0.3],
    },
  };
}

function createOutlineLayerPaint(lineMode: boolean): LineLayerPaint {
  if (lineMode) {
    return createLineModeOutlineLayerPaint();
  }

  return {
    "line-color": ["get", "color"],
    "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 18, 2],
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 17, 0.85],
  };
}

function createLineModeOutlineLayerPaint(): LineLayerPaint {
  return {
    "line-color": ["get", "color"],
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      13,
      ["case", ["==", ["get", "shape"], "omnidirectional"], 1, 1.5],
      15,
      ["case", ["==", ["get", "shape"], "omnidirectional"], 1.4, 3],
      17,
      ["case", ["==", ["get", "shape"], "omnidirectional"], 1.8, 4.5],
      18,
      ["case", ["==", ["get", "shape"], "omnidirectional"], 2, 5.5],
    ],
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 15, 0.7, 17, 0.9],
  };
}

function createOutlineLayerConfig(id: string, sourceId: string, minzoom: number, lineMode: boolean): LayerSpecification {
  return {
    id,
    type: "line",
    source: sourceId,
    minzoom,
    paint: createOutlineLayerPaint(lineMode),
  };
}

function createLabelLayerConfig(id: string, sourceId: string, minzoom: number): LayerSpecification {
  return {
    id,
    type: "symbol",
    source: sourceId,
    minzoom,
    layout: {
      "text-field": ["get", "label"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 14],
      "text-allow-overlap": false,
      "text-anchor": "center",
    },
    paint: {
      "text-color": "#111111",
      "text-halo-color": "rgba(255,255,255,0.9)",
      "text-halo-width": 2,
    },
  };
}

type GeoJSONTripleKey = keyof GeoJSONTriple;

type AzimuthLayerPart = {
  sourceId: string;
  layerId: string;
  dataKey: GeoJSONTripleKey;
  createLayerConfig: (id: string, sourceId: string, minzoom: number, lineMode: boolean) => LayerSpecification;
  syncPaint?: (map: MapLibreMap, layerId: string, lineMode: boolean) => void;
};

function syncOutlineLayerPaint(map: MapLibreMap, layerId: string, lineMode: boolean): void {
  const paint = createOutlineLayerPaint(lineMode);
  map.setPaintProperty(layerId, "line-color", paint["line-color"]);
  map.setPaintProperty(layerId, "line-width", paint["line-width"]);
  map.setPaintProperty(layerId, "line-opacity", paint["line-opacity"]);
}

function syncAzimuthLayerPartStyle(map: MapLibreMap, part: AzimuthLayerPart, minZoom: number, lineMode: boolean): void {
  if (!map.getLayer(part.layerId)) return;
  map.setLayerZoomRange(part.layerId, minZoom, 24);
  part.syncPaint?.(map, part.layerId, lineMode);
}

const INTERNAL_AZIMUTH_LAYER_PARTS: AzimuthLayerPart[] = [
  {
    sourceId: INTERNAL_AZIMUTHS_SOURCE_ID,
    layerId: INTERNAL_AZIMUTHS_FILL_LAYER_ID,
    dataKey: "fill",
    createLayerConfig: (id, sourceId, minzoom) => createFillLayerConfig(id, sourceId, minzoom),
  },
  {
    sourceId: INTERNAL_AZIMUTHS_OUTLINE_SOURCE_ID,
    layerId: INTERNAL_AZIMUTHS_OUTLINE_LAYER_ID,
    dataKey: "outline",
    createLayerConfig: createOutlineLayerConfig,
    syncPaint: syncOutlineLayerPaint,
  },
  {
    sourceId: INTERNAL_AZIMUTHS_LABEL_SOURCE_ID,
    layerId: INTERNAL_AZIMUTHS_LABEL_LAYER_ID,
    dataKey: "label",
    createLayerConfig: (id, sourceId, minzoom) => createLabelLayerConfig(id, sourceId, minzoom),
  },
];

const UKE_AZIMUTH_LAYER_PARTS: AzimuthLayerPart[] = [
  {
    sourceId: UKE_AZIMUTHS_SOURCE_ID,
    layerId: UKE_AZIMUTHS_FILL_LAYER_ID,
    dataKey: "fill",
    createLayerConfig: (id, sourceId, minzoom) => createFillLayerConfig(id, sourceId, minzoom),
  },
  {
    sourceId: UKE_AZIMUTHS_OUTLINE_SOURCE_ID,
    layerId: UKE_AZIMUTHS_OUTLINE_LAYER_ID,
    dataKey: "outline",
    createLayerConfig: createOutlineLayerConfig,
    syncPaint: syncOutlineLayerPaint,
  },
  {
    sourceId: UKE_AZIMUTHS_LABEL_SOURCE_ID,
    layerId: UKE_AZIMUTHS_LABEL_LAYER_ID,
    dataKey: "label",
    createLayerConfig: (id, sourceId, minzoom) => createLabelLayerConfig(id, sourceId, minzoom),
  },
];

const AZIMUTH_LAYER_PARTS = [...INTERNAL_AZIMUTH_LAYER_PARTS, ...UKE_AZIMUTH_LAYER_PARTS];

function ensureAzimuthLayerPartsExist(
  map: MapLibreMap,
  parts: AzimuthLayerPart[],
  triple: GeoJSONTriple,
  minZoom: number,
  beforeLayer: string | undefined,
  lineMode: boolean,
): void {
  for (const part of parts) {
    if (!map.getSource(part.sourceId)) map.addSource(part.sourceId, { type: "geojson", data: triple[part.dataKey] });
    if (!map.getLayer(part.layerId)) map.addLayer(part.createLayerConfig(part.layerId, part.sourceId, minZoom, lineMode), beforeLayer);
    if (map.getLayer(part.layerId)) part.syncPaint?.(map, part.layerId, lineMode);
  }
}

function removeAzimuthLayerParts(map: MapLibreMap): void {
  for (const { layerId } of AZIMUTH_LAYER_PARTS) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {}
  }

  for (const { sourceId } of AZIMUTH_LAYER_PARTS) {
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {}
  }
}

function setGeoJSONSourceData(map: MapLibreMap, sourceId: string, data: GeoJsonFeatureCollection): void {
  void (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}

function syncAzimuthLayerPartsData(map: MapLibreMap, parts: AzimuthLayerPart[], triple: GeoJSONTriple): void {
  for (const part of parts) setGeoJSONSourceData(map, part.sourceId, triple[part.dataKey]);
}

type UseAzimuthLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  locations: LocationWithStations[];
  ukeLocations: UkeLocationWithPermits[];
  enabled: boolean;
  minZoom: number;
  lineLength: number;
  spread: number;
};

export function useAzimuthLayer({ map, isLoaded, locations, ukeLocations, enabled, minZoom, lineLength, spread }: UseAzimuthLayerArgs) {
  const halfAngle = spread / 2;
  const lineMode = halfAngle === 0;
  const ukeTriple = useMemo(
    () => (enabled ? makeGeoJSONTriple(ukeLocationsToAzimuthPoints(ukeLocations), lineLength, halfAngle) : EMPTY_TRIPLE),
    [enabled, lineLength, ukeLocations, halfAngle],
  );
  const internalTriple = useMemo(
    () => (enabled ? makeGeoJSONTriple(internalLocationsToAzimuthPoints(locations), lineLength, halfAngle) : EMPTY_TRIPLE),
    [locations, enabled, lineLength, halfAngle],
  );

  const ukeTripleRef = useRef(ukeTriple);
  const internalTripleRef = useRef(internalTriple);
  const minZoomRef = useRef(minZoom);
  const lineModeRef = useRef(lineMode);

  useEffect(() => {
    ukeTripleRef.current = ukeTriple;
    internalTripleRef.current = internalTriple;
    minZoomRef.current = minZoom;
    lineModeRef.current = lineMode;
  }, [internalTriple, lineMode, minZoom, ukeTriple]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;

    const ensureLayersExist = () => {
      try {
        const beforeLayer = map.getLayer(POINT_LAYER_ID) ? POINT_LAYER_ID : undefined;

        ensureAzimuthLayerPartsExist(
          map,
          INTERNAL_AZIMUTH_LAYER_PARTS,
          internalTripleRef.current,
          minZoomRef.current,
          beforeLayer,
          lineModeRef.current,
        );
        ensureAzimuthLayerPartsExist(map, UKE_AZIMUTH_LAYER_PARTS, ukeTripleRef.current, minZoomRef.current, beforeLayer, lineModeRef.current);
      } catch {}
    };

    ensureLayersExist();
    map.on("styledata", ensureLayersExist);

    return () => {
      map.off("styledata", ensureLayersExist);
      removeAzimuthLayerParts(map);
    };
  }, [map, isLoaded, enabled]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    for (const part of AZIMUTH_LAYER_PARTS) syncAzimuthLayerPartStyle(map, part, minZoom, lineMode);
  }, [map, isLoaded, enabled, minZoom, lineMode]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    syncAzimuthLayerPartsData(map, UKE_AZIMUTH_LAYER_PARTS, ukeTriple);
  }, [map, isLoaded, enabled, ukeTriple]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    syncAzimuthLayerPartsData(map, INTERNAL_AZIMUTH_LAYER_PARTS, internalTriple);
  }, [map, isLoaded, enabled, internalTriple]);
}
