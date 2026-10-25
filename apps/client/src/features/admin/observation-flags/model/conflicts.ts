import type { CellApplyConflict, ObservationFlagConflict, ObservedSiteStationConflict } from "@openbts/shared/contract";
import type { ObservationFlagClosedReason } from "@openbts/shared/contract/constants";

import { ApiResponseError, CONFLICT_STATUS, NOT_FOUND_STATUS, showApiError } from "@/lib/api";

export type QueueConflict =
  | Pick<CellApplyConflict, "kind" | "closedReason">
  | ObservationFlagConflict
  | ObservedSiteStationConflict
  | { kind: "linkForbidden" };

type Detail = Readonly<Record<string, unknown>>;

const FORBIDDEN_STATUS = 403;
const LINKED_STATION_FIELD = "handLink/stationId";
const CLOSED_REASONS: readonly ObservationFlagClosedReason[] = ["applied", "fixedElsewhere", "evidenceGone", "dismissed"];

function isDetail(value: unknown): value is Detail {
  return typeof value === "object" && value !== null;
}

function readDetails(error: unknown, status: number): Detail[] {
  if (!(error instanceof ApiResponseError) || error.status !== status) return [];
  const details = error.errors[0]?.details;
  return Array.isArray(details) ? details.filter(isDetail) : [];
}

function readNumber(detail: Detail, key: string): number | null {
  const value = detail[key];
  return typeof value === "number" ? value : null;
}

function readClosedReason(detail: Detail): ObservationFlagClosedReason | null {
  return CLOSED_REASONS.find((reason) => reason === detail.closedReason) ?? null;
}

function toConflict(detail: Detail): QueueConflict | null {
  const stationId = readNumber(detail, "stationId");
  const observedSiteId = readNumber(detail, "observedSiteId");
  const observationFlagId = readNumber(detail, "observationFlagId");
  const closedReason = readClosedReason(detail);

  if (detail.kind === "resolved") return { kind: "resolved" };
  if (detail.kind === "openFlag" && observationFlagId !== null) return { kind: "openFlag", observationFlagId };
  if ((detail.kind === "madeFromSite" || detail.kind === "matched" || detail.kind === "stationSite") && stationId !== null) {
    return { kind: detail.kind, stationId };
  }
  if (detail.kind === "copy" && observedSiteId !== null) return { kind: "copy", observedSiteId };
  if (detail.kind === "replaced" && Array.isArray(detail.replacedByObservedSiteIds)) {
    return { kind: "replaced", replacedByObservedSiteIds: detail.replacedByObservedSiteIds.filter((id): id is number => typeof id === "number") };
  }
  if (detail.kind === "flagClosed" && closedReason !== null) return { kind: "flagClosed", closedReason };
  return null;
}

export function readQueueConflict(error: unknown): QueueConflict | null {
  for (const detail of readDetails(error, CONFLICT_STATUS)) {
    const conflict = toConflict(detail);
    if (conflict !== null) return conflict;
  }
  return null;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === FORBIDDEN_STATUS;
}

export function isLinkedStationMissing(error: unknown): boolean {
  return readDetails(error, NOT_FOUND_STATUS).some((detail) => detail.field === LINKED_STATION_FIELD);
}

export function reportQueueError(error: unknown, onConflict: (conflict: QueueConflict) => void): void {
  const conflict = readQueueConflict(error);
  if (conflict === null) showApiError(error);
  else onConflict(conflict);
}
