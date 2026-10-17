import { calculateDistance } from "@openbts/shared/geo";
import { TERRAIN_RECEIVER_HEIGHT_M } from "@openbts/shared/terrainProfile";

import type { GeoPoint, TerrainReceiverBounds } from "./types";

const MIN_PATH_DISTANCE_METERS = 10;
const MAX_PATH_DISTANCE_METERS = 30_000;

export const DEFAULT_RECEIVER_HEIGHT_METERS = 5;
export const RECEIVER_HEIGHT_PRESETS_METERS = [1.5, 5, 10] as const;
export const RECEIVER_HEIGHT_BOUNDS_METERS = TERRAIN_RECEIVER_HEIGHT_M;
export const PATH_DISTANCE_TEXT_VALUES = { minMeters: MIN_PATH_DISTANCE_METERS, maxKilometers: MAX_PATH_DISTANCE_METERS / 1000 };

export type ReceiverRangeIssue = "tooClose" | "tooFar" | "outsideCoverage";

const COORDINATE_PRECISION = 100_000;
const HEIGHT_PRECISION = 10;

function isInsideCoverage({ latitude, longitude }: GeoPoint, receiverBounds: TerrainReceiverBounds): boolean {
  const isLatitudeCovered = latitude >= receiverBounds.south && latitude <= receiverBounds.north;
  const isLongitudeCovered = longitude >= receiverBounds.west && longitude <= receiverBounds.east;
  return isLatitudeCovered && isLongitudeCovered;
}

export function getPathDistanceMeters(station: GeoPoint, receiver: GeoPoint): number {
  return calculateDistance(station.latitude, station.longitude, receiver.latitude, receiver.longitude);
}

export function findReceiverRangeIssue(station: GeoPoint, receiver: GeoPoint, receiverBounds: TerrainReceiverBounds): ReceiverRangeIssue | null {
  const distance = getPathDistanceMeters(station, receiver);
  if (distance < MIN_PATH_DISTANCE_METERS) return "tooClose";
  if (distance > MAX_PATH_DISTANCE_METERS) return "tooFar";
  return isInsideCoverage(receiver, receiverBounds) ? null : "outsideCoverage";
}

export function roundReceiverPoint({ latitude, longitude }: GeoPoint): GeoPoint {
  return {
    latitude: Math.round(latitude * COORDINATE_PRECISION) / COORDINATE_PRECISION,
    longitude: Math.round(longitude * COORDINATE_PRECISION) / COORDINATE_PRECISION,
  };
}

export function roundReceiverHeight(heightMeters: number): number {
  return Math.round(heightMeters * HEIGHT_PRECISION) / HEIGHT_PRECISION;
}

export function isReceiverHeightAllowed(heightMeters: number): boolean {
  return Number.isFinite(heightMeters) && heightMeters >= RECEIVER_HEIGHT_BOUNDS_METERS.min && heightMeters <= RECEIVER_HEIGHT_BOUNDS_METERS.max;
}
