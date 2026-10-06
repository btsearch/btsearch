import type { StationStatus } from "@openbts/shared/contract";
import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";

import type { MapPoint, MapPointStation } from "./data/mapPoints";
import { type DuplexRadioLink, getRadioLineMnc } from "./utils";
import { FALLBACK_BRAND_COLOR } from "@/features/station-details/station/utils/brands";
import { getOperatorColor } from "@/lib/cellular/operators";

export type AzimuthPoint = {
  latitude: number;
  longitude: number;
  entries: { azimuth: number | null; color: string }[];
};

export const MAP_POINT_STROKE_COLOR = "#fff";
export const MAP_POINT_STATUS_STROKE_COLORS = {
  awaitingCells: "#eab308",
  inactive: "#ef4444",
} as const satisfies Partial<Record<StationStatus, string>>;

const PIE_COLOR_SEPARATOR = ",";
const STATUS_STROKE_COLORS: ReadonlyMap<string, string> = new Map(Object.entries(MAP_POINT_STATUS_STROKE_COLORS));

export function getMapPointStrokeColor(status: string | undefined): string {
  return (status === undefined ? undefined : STATUS_STROKE_COLORS.get(status)) ?? MAP_POINT_STROKE_COLOR;
}

export function readPieColors(properties: GeoJsonProperties): string[] {
  const pieColors: unknown = properties?.pieColors;
  return typeof pieColors === "string" && pieColors !== "" ? pieColors.split(PIE_COLOR_SEPARATOR) : [];
}

function listOperatorColors(stations: readonly MapPointStation[]): string[] {
  const colorsByOperator = new Map<number | null, string>();
  for (const station of stations) {
    if (!colorsByOperator.has(station.operatorId)) colorsByOperator.set(station.operatorId, station.color);
  }
  return [...colorsByOperator.values()];
}

function findSharedStatus(stations: readonly MapPointStation[]): StationStatus | undefined {
  const statuses = new Set(stations.map((station) => station.status));
  if (statuses.size !== 1) return undefined;
  return stations[0].status ?? undefined;
}

function createPointFeature(lng: number, lat: number, properties: GeoJsonProperties): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  };
}

export function toMapPointFeature(point: MapPoint): Feature {
  const colors = listOperatorColors(point.stations);
  const status = findSharedStatus(point.stations);
  const isMultiOperator = colors.length > 1;
  const pieName = colors.map((color) => color.replace("#", "")).join("-");
  const outlineSuffix = status !== undefined && STATUS_STROKE_COLORS.has(status) ? `-${status}` : "";

  return createPointFeature(point.longitude, point.latitude, {
    locationId: point.id,
    source: point.source,
    city: point.city ?? undefined,
    address: point.address ?? undefined,
    stationCount: point.stations.length,
    color: colors[0] ?? FALLBACK_BRAND_COLOR,
    isMultiOperator,
    pieColors: colors.join(PIE_COLOR_SEPARATOR),
    pieImageId: isMultiOperator ? `pie-${pieName}${outlineSuffix}` : undefined,
    status,
  });
}

export function mapPointsToGeoJSON(points: readonly MapPoint[]): FeatureCollection {
  const drawnPoints = points.filter((point) => point.stations.length > 0);
  return { type: "FeatureCollection", features: drawnPoints.map(toMapPointFeature) };
}

export function toAzimuthPoints(points: readonly MapPoint[]): AzimuthPoint[] {
  return points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    entries: point.stations.flatMap((station) => station.azimuths.map((azimuth) => ({ azimuth, color: station.color }))),
  }));
}

export function radioLinesToGeoJSON(links: DuplexRadioLink[]): {
  lines: FeatureCollection;
  endpoints: FeatureCollection;
} {
  const lineFeatures: Feature[] = [];
  const endpointFeatures: Feature[] = [];

  for (const link of links) {
    const mnc = getRadioLineMnc(link);
    const properties = {
      radioLineId: link.directions[0].id,
      color: mnc ? getOperatorColor(mnc) : FALLBACK_BRAND_COLOR,
      isExpired: link.isExpired,
    };

    lineFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [link.a.longitude, link.a.latitude],
          [link.b.longitude, link.b.latitude],
        ],
      },
      properties,
    });

    endpointFeatures.push(
      createPointFeature(link.a.longitude, link.a.latitude, properties),
      createPointFeature(link.b.longitude, link.b.latitude, properties),
    );
  }

  return {
    lines: { type: "FeatureCollection", features: lineFeatures },
    endpoints: { type: "FeatureCollection", features: endpointFeatures },
  };
}
