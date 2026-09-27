import type { ProposedCellForm, ProposedLocationForm, ProposedStationForm, SectorDraft, StationAction } from "../types";
import type { UplinkType } from "@/types/station";

function isMeaningfulValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v !== "";
  if (typeof v === "boolean") return v;
  return typeof v === "number";
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
  return (
    a.band_id === b.band_id &&
    a._sectorLocalId === b._sectorLocalId &&
    a.rat === b.rat &&
    (a.type ?? null) === (b.type ?? null) &&
    (a.notes ?? "") === (b.notes ?? "") &&
    compareCellDetails(a.details ?? {}, b.details ?? {})
  );
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

export function isEqualSectors(a: SectorDraft[], b: SectorDraft[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i]._localId !== b[i]._localId) return false;
    if (a[i].azimuth !== b[i].azimuth) return false;
  }
  return true;
}

export interface FormState {
  mode: "new" | "existing";
  action: "update" | "delete";
  newStation: ProposedStationForm;
  location: ProposedLocationForm;
  sectors: SectorDraft[];
  cells: ProposedCellForm[];
  submitterNote: string;
}

export interface OriginalState {
  action?: StationAction;
  station?: ProposedStationForm | null;
  location?: ProposedLocationForm | null;
  cells?: ProposedCellForm[];
  sectors?: SectorDraft[];
  networksId?: number | null;
  networksName?: string;
  mnoName?: string;
  uplinkType?: UplinkType | null;
  uplinkSpeed?: number | null;
  uplinkModel?: string;
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
  if (current.action !== (original.action ?? "update")) return true;
  if (current.action === "delete") return current.submitterNote !== (original.submitterNote ?? "");

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
    if (!isEqualSectors(current.sectors, original.sectors ?? [])) return true;
    return false;
  }

  const refLocation = original.location ?? EMPTY_LOCATION;
  if (!isEqualLocation(current.location, refLocation)) return true;

  const refCells = original.cells ?? [];
  if (!isEqualCells(current.cells, refCells)) return true;
  if (!isEqualSectors(current.sectors, original.sectors ?? [])) return true;

  if (current.submitterNote !== (original.submitterNote ?? "")) return true;

  return false;
}
