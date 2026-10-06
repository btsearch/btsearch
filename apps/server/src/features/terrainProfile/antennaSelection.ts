import { circularAzimuthDeltaDeg } from "@openbts/shared/terrainProfile";

import type { AntennaCandidate } from "./types.js";

type KeyedCandidate = { key: string; candidate: AntennaCandidate };

const OMNIDIRECTIONAL_AZIMUTH = 360;

function normalizeAzimuth(azimuth: number | null): number | null {
  if (azimuth === null || azimuth === OMNIDIRECTIONAL_AZIMUTH || !Number.isFinite(azimuth)) return null;
  return ((azimuth % 360) + 360) % 360;
}

function offsetFrom({ candidate }: KeyedCandidate, bearing: number): number {
  const azimuth = normalizeAzimuth(candidate.antenna.azimuth);
  return azimuth === null ? Number.POSITIVE_INFINITY : circularAzimuthDeltaDeg(azimuth, bearing);
}

function order<Value extends number | string>(a: Value, b: Value): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compare(a: KeyedCandidate, b: KeyedCandidate, bearing: number): number {
  const byOffset = order(offsetFrom(a, bearing), offsetFrom(b, bearing));
  if (byOffset !== 0) return byOffset;

  if (normalizeAzimuth(a.candidate.antenna.azimuth) === normalizeAzimuth(b.candidate.antenna.azimuth)) {
    const byBand = order(a.candidate.band?.value ?? Number.POSITIVE_INFINITY, b.candidate.band?.value ?? Number.POSITIVE_INFINITY);
    if (byBand !== 0) return byBand;

    const byFrequency = order(a.candidate.frequencyMHz, b.candidate.frequencyMHz);
    if (byFrequency !== 0) return byFrequency;
  }
  return order(a.key, b.key);
}

export function nearestToBearing(entries: readonly KeyedCandidate[], bearing: number): KeyedCandidate | undefined {
  const directional = entries.filter((entry) => normalizeAzimuth(entry.candidate.antenna.azimuth) !== null);
  const omnidirectional = entries.filter((entry) => entry.candidate.antenna.azimuth === OMNIDIRECTIONAL_AZIMUTH);

  let competing = entries;
  if (directional.length > 0) competing = directional;
  else if (omnidirectional.length > 0) competing = omnidirectional;

  let nearest: KeyedCandidate | undefined;
  for (const entry of competing) {
    if (nearest === undefined || compare(entry, nearest, bearing) < 0) nearest = entry;
  }
  return nearest;
}
