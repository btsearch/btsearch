import { isValidLatLng } from "./geometry";
import type { NsgLocation } from "./types";

const GPS_PREFERENCE_WINDOW_MS = 1000;
const NETWORK_PREFERENCE_WINDOW_MS = 30_000;

export function getNsgLocationTimeUs(location: NsgLocation): bigint | null {
  if (location.fixTimestampMs !== null) {
    const fixUs = Math.round(location.fixTimestampMs * 1000);
    return Number.isSafeInteger(fixUs) ? BigInt(fixUs) : null;
  }
  try {
    return BigInt(location.timestampUs);
  } catch {
    return null;
  }
}

export function getNsgLocationTimeMs(location: NsgLocation): number | null {
  const timestampUs = getNsgLocationTimeUs(location);
  return timestampUs === null ? null : Number(timestampUs) / 1000;
}

type TimedLocation = { location: NsgLocation; timestampUs: bigint };

function providerPriority(provider: string | null): number {
  if (provider === "gps") return 0;
  if (provider === "fused") return 1;
  if (provider === "network") return 2;
  return 3;
}

function accuracy(location: NsgLocation): number {
  return location.accuracy !== null && Number.isFinite(location.accuracy) && location.accuracy >= 0 ? location.accuracy : Infinity;
}

function hasNearbyFix(locations: TimedLocation[], timestampUs: bigint, windowMs: number): boolean {
  let low = 0;
  let high = locations.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (locations[middle].timestampUs < timestampUs) low = middle + 1;
    else high = middle;
  }
  const windowUs = BigInt(windowMs * 1000);
  return (
    (low < locations.length && locations[low].timestampUs - timestampUs <= windowUs) ||
    (low > 0 && timestampUs - locations[low - 1].timestampUs <= windowUs)
  );
}

export function prepareNsgRouteLocations(locations: readonly NsgLocation[]): NsgLocation[] {
  const ordered: TimedLocation[] = [];
  for (const location of locations) {
    const timestampUs = getNsgLocationTimeUs(location);
    if (timestampUs === null || !isValidLatLng(location.latitude, location.longitude)) continue;
    ordered.push({ location, timestampUs });
  }
  ordered.sort((left, right) => {
    if (left.timestampUs !== right.timestampUs) return left.timestampUs < right.timestampUs ? -1 : 1;
    return (
      providerPriority(left.location.provider) - providerPriority(right.location.provider) ||
      accuracy(left.location) - accuracy(right.location) ||
      left.location.eventIndex - right.location.eventIndex
    );
  });
  const gps = ordered.filter((item) => item.location.provider === "gps");
  const precise = ordered.filter((item) => item.location.provider === "gps" || item.location.provider === "fused");
  const result: NsgLocation[] = [];
  let previousTime: bigint | null = null;
  for (const item of ordered) {
    if (item.timestampUs === previousTime) continue;
    if (item.location.provider === "fused" && hasNearbyFix(gps, item.timestampUs, GPS_PREFERENCE_WINDOW_MS)) continue;
    if (item.location.provider === "network" && hasNearbyFix(precise, item.timestampUs, NETWORK_PREFERENCE_WINDOW_MS)) continue;
    result.push(item.location);
    previousTime = item.timestampUs;
  }
  return result;
}

export function getClosestNsgRouteLocation(locations: readonly NsgLocation[], timestampMs: number): NsgLocation | null {
  if (locations.length === 0 || !Number.isFinite(timestampMs)) return null;
  let low = 0;
  let high = locations.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (getNsgLocationTimeMs(locations[middle])! < timestampMs) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return locations[0];
  if (low === locations.length) return locations[low - 1];
  const earlier = locations[low - 1];
  const later = locations[low];
  return timestampMs - getNsgLocationTimeMs(earlier)! <= getNsgLocationTimeMs(later)! - timestampMs ? earlier : later;
}
