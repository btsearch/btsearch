import { canConnectNsgRoutePositions, isValidLatLng } from "./geometry";
import { getNsgLocationTimeMs } from "./locations";
import { getNsgReplayLocationIndex } from "./replay";
import type { NsgLocation } from "./types";

export type NsgReplayPosition = { longitude: number; latitude: number; location: NsgLocation };

export function getNsgReplayPosition(locations: readonly NsgLocation[], playheadMs: number): NsgReplayPosition | null {
  const index = getNsgReplayLocationIndex(locations, playheadMs);
  if (index < 0) return null;
  const location = locations[index];
  const timestampMs = getNsgLocationTimeMs(location);
  if (timestampMs === null || !Number.isFinite(timestampMs) || !isValidLatLng(location.latitude, location.longitude)) return null;
  const position = { latitude: location.latitude, longitude: location.longitude, location };
  const next = locations[index + 1];
  if (!next || playheadMs === timestampMs) return position;
  const nextTimestampMs = getNsgLocationTimeMs(next);
  if (!canConnectNsgRoutePositions({ location, timestampMs }, { location: next, timestampMs: nextTimestampMs })) return position;
  const fraction = (playheadMs - timestampMs) / (nextTimestampMs! - timestampMs);
  return {
    latitude: location.latitude + (next.latitude - location.latitude) * fraction,
    longitude: location.longitude + (next.longitude - location.longitude) * fraction,
    location,
  };
}
