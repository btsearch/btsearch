import type { TerrainRequestFailure } from "./api";
import type { ReceiverRangeIssue } from "./receiverRange";
import type { TerrainFailureReason } from "./types";

export type TerrainFailureKind = ReceiverRangeIssue | TerrainRequestFailure | Exclude<TerrainFailureReason, "internalError">;

const FAILURE_TEXT_KEYS: Record<TerrainFailureKind, string> = {
  tooFar: "failures.tooFar",
  tooClose: "failures.tooClose",
  outsideCoverage: "failures.outsideCoverage",
  rejectedReceiver: "states.failureCodes.PATH_DISTANCE_OUT_OF_RANGE",
  antennaDataUnavailable: "states.failureCodes.ANTENNA_DATA_UNAVAILABLE",
  antennaNotFound: "warnings.codes.ANTENNA_SELECTION_INVALID",
  elevationDataUnavailable: "states.failureCodes.TERRAIN_DATA_UNAVAILABLE",
  rateLimited: "failures.rateLimited",
  sourceUnavailable: "failures.sourceUnavailable",
  unknown: "failures.unknown",
};

const RETRYABLE_FAILURES = new Set<TerrainFailureKind>([
  "antennaNotFound",
  "elevationDataUnavailable",
  "rateLimited",
  "sourceUnavailable",
  "unknown",
]);

export function getFailureTextKey(failure: TerrainFailureKind): string {
  return FAILURE_TEXT_KEYS[failure];
}

export function isRetryableFailure(failure: TerrainFailureKind): boolean {
  return RETRYABLE_FAILURES.has(failure);
}

export function toFailureKind(reason: TerrainFailureReason): TerrainFailureKind {
  return reason === "internalError" ? "unknown" : reason;
}
