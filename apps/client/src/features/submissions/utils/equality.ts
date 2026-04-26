import type { CellPayload, ProposedCellForm, ProposedLocationForm, ProposedStationForm } from "../types";

function isMeaningfulValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v !== "";
  if (typeof v === "boolean") return v;
  return typeof v === "number";
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeySet = new Set(Object.keys(bObj));

  if (aKeys.length !== bKeySet.size) return false;

  for (const key of aKeys) {
    if (!bKeySet.has(key)) return false;
    if (!isEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

function compareCellDetails(a: Partial<Record<string, unknown>>, b: Partial<Record<string, unknown>>): boolean {
  const aEntries = Object.entries(a).filter(([, v]) => v !== undefined);
  const bMap = new Map(Object.entries(b).filter(([, v]) => v !== undefined));

  if (aEntries.length !== bMap.size) return false;

  for (const [key, val] of aEntries) {
    if (!bMap.has(key) || bMap.get(key) !== val) return false;
  }

  return true;
}

export function isEqualCell(a: ProposedCellForm, b: ProposedCellForm): boolean {
  return a.band_id === b.band_id && a.rat === b.rat && (a.notes ?? "") === (b.notes ?? "") && compareCellDetails(a.details ?? {}, b.details ?? {});
}

export function isEqualCells(a: ProposedCellForm[], b: ProposedCellForm[]): boolean {
  if (a.length !== b.length) return false;

  const sortKey = (c: ProposedCellForm) => String(c.existingCellId ?? c.id);
  const aSorted = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const bSorted = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));

  for (let i = 0; i < aSorted.length; i++) {
    if (!isEqualCell(aSorted[i], bSorted[i])) return false;
  }

  return true;
}

export function isEqualStation(a: ProposedStationForm, b: ProposedStationForm): boolean {
  return a.station_id === b.station_id && a.operator_id === b.operator_id && (a.notes ?? "") === (b.notes ?? "");
}

export function isEqualLocation(a: ProposedLocationForm, b: ProposedLocationForm): boolean {
  return (
    a.region_id === b.region_id &&
    (a.city ?? "") === (b.city ?? "") &&
    (a.address ?? "") === (b.address ?? "") &&
    a.longitude === b.longitude &&
    a.latitude === b.latitude
  );
}

export function isEqualCellPayload(a: CellPayload, b: CellPayload): boolean {
  return (
    a.operation === b.operation &&
    a.target_cell_id === b.target_cell_id &&
    a.band_id === b.band_id &&
    a.rat === b.rat &&
    (a.notes ?? "") === (b.notes ?? "") &&
    compareCellDetails((a.details ?? {}) as Record<string, unknown>, (b.details ?? {}) as Record<string, unknown>)
  );
}

export function isEqualCellPayloads(a: CellPayload[], b: CellPayload[]): boolean {
  if (a.length !== b.length) return false;

  const sortKey = (c: CellPayload) => `${c.rat}-${c.band_id}-${c.target_cell_id ?? "new"}`;
  const aSorted = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const bSorted = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));

  for (let i = 0; i < aSorted.length; i++) {
    if (!isEqualCellPayload(aSorted[i], bSorted[i])) return false;
  }

  return true;
}

export interface FormState {
  mode: "new" | "existing";
  action: "update" | "delete";
  newStation: ProposedStationForm;
  location: ProposedLocationForm;
  cells: ProposedCellForm[];
  submitterNote: string;
}

export interface OriginalState {
  station?: ProposedStationForm | null;
  location?: ProposedLocationForm | null;
  cells?: ProposedCellForm[];
  networksId?: number | null;
  networksName?: string;
  mnoName?: string;
  submitterNote?: string;
}

const EMPTY_STATION: ProposedStationForm = { station_id: "", operator_id: null, notes: "" };
const EMPTY_LOCATION: ProposedLocationForm = {
  region_id: null,
  city: "",
  address: "",
  longitude: null,
  latitude: null,
};

export function hasFormChanges(current: FormState, original: OriginalState): boolean {
  if (current.action === "delete") return true;

  if (current.mode === "new") {
    const refStation = original.station ?? EMPTY_STATION;
    if (!isEqualStation(current.newStation, refStation)) return true;
    const refLocation = original.location ?? EMPTY_LOCATION;
    if (!isEqualLocation(current.location, refLocation)) return true;
    const refCells = original.cells;
    if (refCells !== undefined) {
      if (!isEqualCells(current.cells, refCells)) return true;
    } else if (current.cells.some((cell) => cell.band_id !== null || Object.values(cell.details).some(isMeaningfulValue))) {
      return true;
    }
    return false;
  }

  const refLocation = original.location ?? EMPTY_LOCATION;
  if (!isEqualLocation(current.location, refLocation)) return true;

  const refCells = original.cells ?? [];
  if (!isEqualCells(current.cells, refCells)) return true;

  if (current.submitterNote !== (original.submitterNote ?? "")) return true;

  return false;
}

export interface SubmissionPayload {
  type: "new" | "update" | "delete";
  station_id?: number | null;
  submitter_note?: string | null;
  station?: ProposedStationForm;
  location?: ProposedLocationForm;
  cells?: CellPayload[];
}

export function hasSubmissionChanges(payload: SubmissionPayload): boolean {
  if (payload.submitter_note?.trim()) return true;
  if (payload.type === "delete") return true;

  if (payload.station) {
    const { station_id, operator_id, notes } = payload.station;
    if (station_id || operator_id || notes?.trim()) return true;
  }

  if (payload.location) {
    const { region_id, city, address, longitude, latitude } = payload.location;
    if (region_id !== null || city?.trim() || address?.trim() || longitude !== null || latitude !== null) return true;
  }

  if (
    payload.cells?.some(
      (cell) =>
        (cell.band_id !== null && cell.band_id !== undefined) ||
        !!cell.notes?.trim() ||
        (cell.details && Object.values(cell.details).some(isMeaningfulValue)),
    )
  )
    return true;

  return false;
}
