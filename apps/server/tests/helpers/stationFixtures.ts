import type { StationRow } from "../../src/features/stations/serialize.js";
import { dbMock } from "./boundaries.js";

export function stationRow(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date("2026-10-06T10:00:00.000Z");
  const row: StationRow = {
    id: 1,
    station_id: "A1",
    operator_id: 1,
    location_id: null,
    status: "published",
    is_confirmed: true,
    notes: null,
    extra_address: null,
    createdAt,
    updatedAt: createdAt,
    statusChangedAt: createdAt,
  };
  return { ...row, ...overrides };
}

export function visibleStation(row = stationRow()) {
  dbMock.enqueueFor("select", "stations", [{ station: row, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "countries", []);
}
