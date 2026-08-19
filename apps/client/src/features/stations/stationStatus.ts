import type { StationStatus } from "@/types/station";

export const STATION_STATUS_VALUES = ["published", "pending", "inactive"] as const satisfies readonly StationStatus[];
export const DEFAULT_STATIONS_LIST_STATUSES = ["published", "pending"] as const satisfies readonly StationStatus[];

export function isStationStatus(value: string): value is StationStatus {
  return STATION_STATUS_VALUES.some((status) => status === value);
}

export function isDefaultStationsListStatusSelection(statuses: readonly StationStatus[]): boolean {
  return statuses.length === DEFAULT_STATIONS_LIST_STATUSES.length && DEFAULT_STATIONS_LIST_STATUSES.every((status) => statuses.includes(status));
}

export function getStationStatusFilterCount(statuses: readonly StationStatus[]): number {
  return isDefaultStationsListStatusSelection(statuses) ? 0 : statuses.length;
}

export function toggleStationStatusSelection(statuses: readonly StationStatus[], status: StationStatus): StationStatus[] {
  const nextStatuses = statuses.includes(status) ? statuses.filter((value) => value !== status) : [...statuses, status];
  return nextStatuses.length > 0 ? nextStatuses : [...statuses];
}
