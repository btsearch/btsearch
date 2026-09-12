import type { FeatureCollection, LineString } from "geojson";

import { SIGNAL_UNKNOWN_COLOR, type SignalPoint } from "./signalTrail";
import { isValidLatLng } from "@/lib/nsg-parser";

export const ROUTE_MAX_GAP_MS = 60_000;
export type RouteGeometry = FeatureCollection<LineString, { color: string }>;
type RoutePosition = Pick<SignalPoint, "location" | "timestampMs">;
type ScreenPoint = { x: number; y: number };

function isFiniteScreenPoint(point: ScreenPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function hasValidPosition(point: RoutePosition): boolean {
  return isValidLatLng(point.location.latitude, point.location.longitude);
}

function isNetworkTransition(previous: RoutePosition, current: RoutePosition): boolean {
  const previousProvider = previous.location.provider?.toLowerCase();
  const currentProvider = current.location.provider?.toLowerCase();
  return (
    (previousProvider === "network" && (currentProvider === "gps" || currentProvider === "fused")) ||
    (currentProvider === "network" && (previousProvider === "gps" || previousProvider === "fused"))
  );
}

export function canConnectRoutePositions(previous: RoutePosition, current: RoutePosition): boolean {
  if (!hasValidPosition(previous) || !hasValidPosition(current)) return false;
  if (previous.timestampMs === null || current.timestampMs === null) return false;
  const elapsedMs = current.timestampMs - previous.timestampMs;
  return Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= ROUTE_MAX_GAP_MS && !isNetworkTransition(previous, current);
}

function getSegmentProgress(target: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) return 0;
  return Math.max(0, Math.min(1, ((target.x - start.x) * segmentX + (target.y - start.y) * segmentY) / lengthSquared));
}

export function findClosestRoutePoint(
  points: readonly SignalPoint[],
  target: ScreenPoint,
  project: (location: SignalPoint["location"]) => ScreenPoint,
): SignalPoint | null {
  if (!isFiniteScreenPoint(target)) return null;
  let closest: SignalPoint | null = null;
  let shortestDistance = Infinity;
  let previousProjection: ScreenPoint | null = null;
  const pointCount = points.length;
  for (let index = 1; index < pointCount; index++) {
    const previous = points[index - 1];
    const current = points[index];
    if (!canConnectRoutePositions(previous, current)) {
      previousProjection = null;
      continue;
    }
    const start = previousProjection ?? project(previous.location);
    const end = project(current.location);
    const hasFiniteEnd = isFiniteScreenPoint(end);
    previousProjection = hasFiniteEnd ? end : null;
    if (!isFiniteScreenPoint(start) || !hasFiniteEnd) continue;
    const progress = getSegmentProgress(target, start, end);
    const offsetX = target.x - (start.x + progress * (end.x - start.x));
    const offsetY = target.y - (start.y + progress * (end.y - start.y));
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;
    if (distanceSquared >= shortestDistance) continue;
    closest = progress <= 0.5 ? previous : current;
    shortestDistance = distanceSquared;
  }
  return closest;
}

export function createRouteGeometry(points: readonly SignalPoint[]): RouteGeometry {
  const features: RouteGeometry["features"] = [];
  let segment: RouteGeometry["features"][number] | undefined;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    if (!canConnectRoutePositions(previous, current)) {
      segment = undefined;
      continue;
    }
    const color = previous.status === "available" && current.status === "available" ? previous.color : SIGNAL_UNKNOWN_COLOR;
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
