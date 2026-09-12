import { findReplayLocationIndex } from "../replay/replayClock";
import { canConnectRoutePositions } from "./routeGeometry";
import { getLocationTimeMs } from "./routeLocations";
import { isValidLatLng } from "@/lib/nsg-parser";
import type { NsgLocation } from "@/lib/nsg-parser/model";

export type ReplayPosition = { longitude: number; latitude: number; location: NsgLocation };

export function getReplayPosition(locations: readonly NsgLocation[], playheadMs: number): ReplayPosition | null {
  const index = findReplayLocationIndex(locations, playheadMs);
  if (index < 0) return null;
  const location = locations[index];
  const timestampMs = getLocationTimeMs(location);
  if (timestampMs === null || !Number.isFinite(timestampMs) || !isValidLatLng(location.latitude, location.longitude)) return null;
  const position = { latitude: location.latitude, longitude: location.longitude, location };
  const next = locations[index + 1];
  if (!next || playheadMs === timestampMs) return position;
  const nextTimestampMs = getLocationTimeMs(next);
  if (!canConnectRoutePositions({ location, timestampMs }, { location: next, timestampMs: nextTimestampMs })) return position;
  const fraction = (playheadMs - timestampMs) / (nextTimestampMs! - timestampMs);
  return {
    latitude: location.latitude + (next.latitude - location.latitude) * fraction,
    longitude: location.longitude + (next.longitude - location.longitude) * fraction,
    location,
  };
}
