import { calculateBearing } from "@openbts/shared/radiolinesUtils";
import { ANTENNA_AZIMUTH_TOLERANCE_DEG, circularAzimuthDeltaDeg } from "@openbts/shared/terrainProfile";

import type { TerrainProfileAntennaCandidate, TerrainProfileReceiver, TerrainProfileStationResult } from "./types";

function normalizeAzimuth(azimuth: number | null) {
  if (azimuth === null || azimuth === 360 || !Number.isFinite(azimuth)) return null;
  return ((azimuth % 360) + 360) % 360;
}

function isDirectionalCandidate(candidate: TerrainProfileAntennaCandidate) {
  return normalizeAzimuth(candidate.antenna.azimuth) !== null;
}

function isOmnidirectionalCandidate(candidate: TerrainProfileAntennaCandidate) {
  return candidate.antenna.azimuth === 360;
}

function circularAzimuthDelta(azimuth: number | null, bearingDeg: number) {
  const normalized = normalizeAzimuth(azimuth);
  if (normalized === null || !Number.isFinite(bearingDeg)) return Number.POSITIVE_INFINITY;
  return circularAzimuthDeltaDeg(normalized, bearingDeg);
}

function compareRankValues(a: number, b: number) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function candidateBandFrequency(candidate: TerrainProfileAntennaCandidate) {
  if (candidate.band !== null && candidate.band.value !== null && Number.isFinite(candidate.band.value)) return candidate.band.value;
  return Number.POSITIVE_INFINITY;
}

function candidateFrequency(candidate: TerrainProfileAntennaCandidate) {
  return Number.isFinite(candidate.frequencyMHz) ? candidate.frequencyMHz : Number.POSITIVE_INFINITY;
}

function compareCandidates(a: TerrainProfileAntennaCandidate, b: TerrainProfileAntennaCandidate, bearingDeg: number) {
  const deltaDifference = compareRankValues(circularAzimuthDelta(a.antenna.azimuth, bearingDeg), circularAzimuthDelta(b.antenna.azimuth, bearingDeg));
  if (deltaDifference !== 0) return deltaDifference;

  if (normalizeAzimuth(a.antenna.azimuth) === normalizeAzimuth(b.antenna.azimuth)) {
    const bandDifference = compareRankValues(candidateBandFrequency(a), candidateBandFrequency(b));
    if (bandDifference !== 0) return bandDifference;

    const frequencyDifference = compareRankValues(candidateFrequency(a), candidateFrequency(b));
    if (frequencyDifference !== 0) return frequencyDifference;
  }

  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}

export function filterTerrainProfileCandidatesByBearing(
  candidates: TerrainProfileAntennaCandidate[],
  station: Pick<TerrainProfileStationResult, "latitude" | "longitude">,
  receiver: TerrainProfileReceiver,
) {
  const bearingDeg = calculateBearing(station.latitude, station.longitude, receiver.latitude, receiver.longitude);
  const inRange = candidates.filter(
    (candidate) =>
      candidate.antenna.azimuth === null ||
      isOmnidirectionalCandidate(candidate) ||
      circularAzimuthDelta(candidate.antenna.azimuth, bearingDeg) <= ANTENNA_AZIMUTH_TOLERANCE_DEG,
  );
  return inRange.length > 0 ? inRange : candidates;
}

export function selectTerrainProfileAntenna(
  candidates: TerrainProfileAntennaCandidate[],
  station: TerrainProfileStationResult,
  receiver: TerrainProfileReceiver,
) {
  const bearingDeg = calculateBearing(station.latitude, station.longitude, receiver.latitude, receiver.longitude);
  const directionalCandidates = candidates.filter(isDirectionalCandidate);
  const omnidirectionalCandidates = candidates.filter(isOmnidirectionalCandidate);

  let rankedCandidates = candidates;
  if (directionalCandidates.length > 0) rankedCandidates = directionalCandidates;
  else if (omnidirectionalCandidates.length > 0) rankedCandidates = omnidirectionalCandidates;

  let selectedCandidate: TerrainProfileAntennaCandidate | undefined;

  for (const candidate of rankedCandidates) {
    if (selectedCandidate === undefined || compareCandidates(candidate, selectedCandidate, bearingDeg) < 0) selectedCandidate = candidate;
  }

  return selectedCandidate;
}
