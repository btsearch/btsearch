import type { stations } from "@openbts/drizzle";
import { sql } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";

export type StationStatus = typeof stations.$inferSelect.status;

type StationStatusState = {
  status: StationStatus;
};

export const DEFAULT_STATION_STATUSES: StationStatus[] = ["published", "pending"];
const STATION_STATUS_VALUES = new Set<StationStatus>(["published", "pending", "inactive"]);

export function parseStationStatusParam(value?: string): StationStatus[] {
  if (!value) return DEFAULT_STATION_STATUSES;
  return [...new Set(value.split(",").filter((entry): entry is StationStatus => STATION_STATUS_VALUES.has(entry as StationStatus)))];
}

export function buildStatusCondition(stationFields: typeof stations, selectedStatuses: StationStatus[]): ReturnType<typeof sql> {
  if (selectedStatuses.length === 0) return sql`false`;
  return sql`${stationFields.status} IN (${sql.join(
    selectedStatuses.map((status) => sql`${status}`),
    sql`,`,
  )})`;
}

export function stationStatusForCellCount(cellCount: number): StationStatus {
  return cellCount > 0 ? "published" : "pending";
}

export function assertCanMutateStationCells(station: StationStatusState): void {
  if (station.status !== "published") throw new ErrorResponse("BAD_REQUEST", { message: "Cells can only be edited for published stations" });
}

export function assertCanDeleteCells(station: StationStatusState, remainingCellCount: number): void {
  assertCanMutateStationCells(station);
  if (remainingCellCount < 1) throw new ErrorResponse("BAD_REQUEST", { message: "A published station must keep at least one cell" });
}

export function assertStationStatusTransition(currentStatus: StationStatus, nextStatus: StationStatus): void {
  if (currentStatus === nextStatus) return;
  if (currentStatus === "pending" && nextStatus === "published") return;
  if (currentStatus === "pending" && nextStatus === "inactive") return;
  if (currentStatus === "published" && nextStatus === "inactive") return;
  throw new ErrorResponse("BAD_REQUEST", { message: `Station status cannot change from ${currentStatus} to ${nextStatus}` });
}

export function stationStatusUpdate(status: StationStatus, now = new Date()) {
  return { status, statusChangedAt: now, updatedAt: now };
}
