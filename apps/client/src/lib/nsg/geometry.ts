import type { FeatureCollection, LineString } from "geojson";

import { NSG_SIGNAL_UNKNOWN_COLOR, type NsgSignalPoint } from "./signal";

export const NSG_ROUTE_MAX_GAP_MS = 60_000;
export type NsgRouteGeometry = FeatureCollection<LineString, { color: string }>;
type NsgRoutePosition = Pick<NsgSignalPoint, "location" | "timestampMs">;

function hasValidPosition(point: NsgRoutePosition): boolean {
  const { latitude, longitude } = point.location;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

function isNetworkTransition(previous: NsgRoutePosition, current: NsgRoutePosition): boolean {
  const previousProvider = previous.location.provider?.toLowerCase();
  const currentProvider = current.location.provider?.toLowerCase();
  return (
    (previousProvider === "network" && (currentProvider === "gps" || currentProvider === "fused")) ||
    (currentProvider === "network" && (previousProvider === "gps" || previousProvider === "fused"))
  );
}

export function canConnectNsgRoutePositions(previous: NsgRoutePosition, current: NsgRoutePosition): boolean {
  if (!hasValidPosition(previous) || !hasValidPosition(current)) return false;
  if (previous.timestampMs === null || current.timestampMs === null) return false;
  const elapsedMs = current.timestampMs - previous.timestampMs;
  return Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= NSG_ROUTE_MAX_GAP_MS && !isNetworkTransition(previous, current);
}

export function createNsgRouteGeometry(points: readonly NsgSignalPoint[]): NsgRouteGeometry {
  const features: NsgRouteGeometry["features"] = [];
  let segment: NsgRouteGeometry["features"][number] | undefined;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    if (!canConnectNsgRoutePositions(previous, current)) {
      segment = undefined;
      continue;
    }
    const color = previous.status === "available" && current.status === "available" ? previous.color : NSG_SIGNAL_UNKNOWN_COLOR;
    const coordinate = [current.location.longitude, current.location.latitude];
    if (segment?.properties.color === color) segment.geometry.coordinates.push(coordinate);
    else {
      segment = {
        type: "Feature",
        properties: { color },
        geometry: { type: "LineString", coordinates: [[previous.location.longitude, previous.location.latitude], coordinate] },
      };
      features.push(segment);
    }
  }
  return { type: "FeatureCollection", features };
}
