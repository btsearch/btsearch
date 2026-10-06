import type { TerrainResult, TerrainSample } from "./types";
import type { TerrainPathVerdict } from "./verdict";

export type SampleRun = {
  firstIndex: number;
  lastIndex: number;
};

type WorstPoint = {
  index: number;
  distanceMeters: number;
  clearanceMeters: number;
};

export type ProfileSummary = {
  obstructingHeights: number[];
  clearances: number[];
  blockedRuns: SampleRun[];
  worst: WorstPoint | null;
};

export type ProfileHighlight =
  | { kind: "clearance"; index: number; distanceMeters: number; clearanceMeters: number }
  | { kind: "obstruction"; index: number; distanceMeters: number; depthMeters: number | null };

const summariesByResult = new WeakMap<TerrainResult, ProfileSummary>();

function getObstructingHeight(sample: TerrainSample, isSurfaceKnown: boolean): number {
  return isSurfaceKnown && sample.surfaceMeters !== null ? sample.surfaceMeters : sample.groundMeters;
}

function listBlockedRuns(clearances: readonly number[]): SampleRun[] {
  const runs: SampleRun[] = [];
  let firstIndex: number | null = null;

  for (let index = 0; index < clearances.length; index++) {
    const isBlocked = clearances[index] < 0;
    if (isBlocked && firstIndex === null) firstIndex = index;
    if (!isBlocked && firstIndex !== null) {
      runs.push({ firstIndex, lastIndex: index - 1 });
      firstIndex = null;
    }
  }

  if (firstIndex !== null) runs.push({ firstIndex, lastIndex: clearances.length - 1 });
  return runs;
}

function findWorstPoint(samples: readonly TerrainSample[], clearances: readonly number[]): WorstPoint | null {
  let worst: WorstPoint | null = null;

  for (let index = 0; index < samples.length; index++) {
    const clearanceMeters = clearances[index];
    if (worst === null || clearanceMeters < worst.clearanceMeters) worst = { index, distanceMeters: samples[index].distanceMeters, clearanceMeters };
  }

  return worst;
}

export function summarizeProfile(result: TerrainResult): ProfileSummary {
  const knownSummary = summariesByResult.get(result);
  if (knownSummary !== undefined) return knownSummary;

  const isSurfaceKnown = result.surfaceVerdict !== "unknown";
  const obstructingHeights = result.samples.map((sample) => getObstructingHeight(sample, isSurfaceKnown));
  const clearances = result.samples.map((sample, index) => sample.sightLineMeters - obstructingHeights[index]);
  const blockedRuns = listBlockedRuns(clearances);
  const summary: ProfileSummary = { obstructingHeights, clearances, blockedRuns, worst: findWorstPoint(result.samples, clearances) };

  summariesByResult.set(result, summary);
  return summary;
}

export function findNearestSampleIndex(samples: readonly TerrainSample[], distanceMeters: number): number | null {
  let nearestIndex: number | null = null;
  let nearestGap = Number.POSITIVE_INFINITY;

  for (let index = 0; index < samples.length; index++) {
    const gap = Math.abs(samples[index].distanceMeters - distanceMeters);
    if (gap < nearestGap) {
      nearestIndex = index;
      nearestGap = gap;
    }
  }

  return nearestIndex;
}

export function getProfileHighlight(result: TerrainResult, summary: ProfileSummary, verdict: TerrainPathVerdict): ProfileHighlight | null {
  const { worst } = summary;
  if (verdict === "unavailable" || worst === null) return null;

  if (verdict === "clear") {
    return { kind: "clearance", index: worst.index, distanceMeters: worst.distanceMeters, clearanceMeters: Math.max(0, worst.clearanceMeters) };
  }
  if (worst.clearanceMeters < 0) {
    return { kind: "obstruction", index: worst.index, distanceMeters: worst.distanceMeters, depthMeters: -worst.clearanceMeters };
  }

  const { obstacleDistanceMeters } = result;
  if (obstacleDistanceMeters === null) return null;
  const index = findNearestSampleIndex(result.samples, obstacleDistanceMeters);
  return index === null ? null : { kind: "obstruction", index, distanceMeters: obstacleDistanceMeters, depthMeters: null };
}
