import type { StationStatus } from "@openbts/shared/contract";

const STATUS_WORDS: Record<StationStatus, StationStatus> = { active: "active", awaitingCells: "awaitingCells", inactive: "inactive" };

export const LIST_STATION_STATUSES: readonly StationStatus[] = Object.values(STATUS_WORDS);
export const DEFAULT_LIST_STATION_STATUSES: readonly StationStatus[] = ["active", "awaitingCells"];

export function isDefaultListStationStatuses(statuses: readonly StationStatus[]): boolean {
  return statuses.length === DEFAULT_LIST_STATION_STATUSES.length && DEFAULT_LIST_STATION_STATUSES.every((status) => statuses.includes(status));
}
