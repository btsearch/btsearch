import { RAT_ORDER } from "@/features/shared/rat";
import type { SectorDraft } from "@/types/station";

import type { CellFormDetails, CellPayload, ProposedCellForm, SectorPayload } from "../types";

export function generateCellId(): string {
  return crypto.randomUUID();
}

function areDetailsEqual(a: Partial<CellFormDetails>, b: Partial<CellFormDetails>): boolean {
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const keysA = Object.keys(aRec).filter((k) => aRec[k] !== undefined);
  const keysB = Object.keys(bRec).filter((k) => bRec[k] !== undefined);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (aRec[key] !== bRec[key]) return false;
  }

  return true;
}

export function sectorLocalIdToTargetId(localId: string | null | undefined): number | null {
  if (!localId?.startsWith("sector-")) return null;
  const id = Number.parseInt(localId.slice("sector-".length), 10);
  return Number.isNaN(id) ? null : id;
}

export function sectorAssignmentPayload(
  localId: string | null | undefined,
): Pick<CellPayload, "target_sector_id" | "sector_local_id" | "sector_unassigned"> {
  if (localId === undefined) return {};
  if (localId === null) return { target_sector_id: null, sector_local_id: null, sector_unassigned: true };
  const targetSectorId = sectorLocalIdToTargetId(localId);
  if (targetSectorId !== null) return { target_sector_id: targetSectorId, sector_local_id: null, sector_unassigned: false };
  return { target_sector_id: null, sector_local_id: localId, sector_unassigned: false };
}

export function sectorsToPayloads(sectors: SectorDraft[]): SectorPayload[] {
  return sectors.flatMap((sector) => {
    if (typeof sector.azimuth !== "number") return [];

    return [
      {
        local_id: sector._localId,
        target_sector_id: sector.id ?? sectorLocalIdToTargetId(sector._localId),
        azimuth: sector.azimuth,
      },
    ];
  });
}

function isCellModified(current: ProposedCellForm, original: ProposedCellForm): boolean {
  return (
    current.band_id !== original.band_id ||
    current._sectorLocalId !== original._sectorLocalId ||
    (current.type ?? null) !== (original.type ?? null) ||
    current.notes !== original.notes ||
    !areDetailsEqual(current.details, original.details)
  );
}

function toCellPayload(cell: ProposedCellForm, operation: CellPayload["operation"]): CellPayload {
  return {
    operation,
    target_cell_id: cell.existingCellId,
    ...sectorAssignmentPayload(cell._sectorLocalId),
    band_id: cell.band_id,
    rat: cell.rat,
    type: cell.type ?? null,
    notes: cell.notes ?? null,
    details: operation === "delete" ? undefined : cell.details,
  };
}

export function computeCellPayloads(originalCells: ProposedCellForm[], currentCells: ProposedCellForm[]): CellPayload[] {
  const payloads: CellPayload[] = [];

  const originalById = new Map<number, ProposedCellForm>();
  for (const cell of originalCells) {
    if (cell.existingCellId !== undefined) originalById.set(cell.existingCellId, cell);
  }

  const currentExistingIds = new Set<number>();
  for (const cell of currentCells) {
    if (cell.existingCellId !== undefined) currentExistingIds.add(cell.existingCellId);
  }

  for (const cell of currentCells) {
    if (cell.existingCellId === undefined) payloads.push(toCellPayload(cell, "add"));
    else {
      const original = originalById.get(cell.existingCellId);
      if (original && isCellModified(cell, original)) payloads.push(toCellPayload(cell, "update"));
    }
  }

  for (const original of originalCells) {
    if (original.existingCellId !== undefined && !currentExistingIds.has(original.existingCellId)) payloads.push(toCellPayload(original, "delete"));
  }

  return payloads;
}

export function cellsToPayloads(cells: ProposedCellForm[]): CellPayload[] {
  return cells.map((cell) => toCellPayload(cell, "add"));
}

export type CellDiffStatus = "added" | "modified" | "unchanged" | "deleted";

export function buildOriginalCellsMap(originalCells: ProposedCellForm[]): Map<number, ProposedCellForm> {
  const map = new Map<number, ProposedCellForm>();
  for (const cell of originalCells) if (cell.existingCellId !== undefined) map.set(cell.existingCellId, cell);
  return map;
}

export function getCellDiffStatus(cell: ProposedCellForm, originalsMap: Map<number, ProposedCellForm>): CellDiffStatus {
  if (cell.existingCellId === undefined) return "added";

  const original = originalsMap.get(cell.existingCellId);
  if (!original) return "added";

  return isCellModified(cell, original) ? "modified" : "unchanged";
}

type UkePermitForCells = {
  band?: { rat: string; id: number } | null;
  source?: "permits" | "device_registry";
  sectors?: unknown[];
};

const EDITABLE_RATS = new Set<string>(RAT_ORDER);

function isEditableRat(rat: string): rat is ProposedCellForm["rat"] {
  return EDITABLE_RATS.has(rat);
}

export function computeUkeBandCounts(permits: UkePermitForCells[]): Map<string, number> {
  const drCountsByBand = new Map<string, number>();
  let minDrCount = Infinity;
  for (const permit of permits) {
    const band = permit.band;
    if (!band || !isEditableRat(band.rat)) continue;
    if (permit.source !== "device_registry") continue;
    const key = `${band.rat}-${band.id}`;
    if (!drCountsByBand.has(key)) {
      const count = permit.sectors?.length ?? 0;
      drCountsByBand.set(key, count);
      if (count > 0 && count < minDrCount) minDrCount = count;
    }
  }

  const fallbackCount = minDrCount === Infinity ? 1 : Math.max(minDrCount, 1);

  const result = new Map<string, number>();
  const seen = new Set<string>();
  for (const permit of permits) {
    const band = permit.band;
    if (!band || !isEditableRat(band.rat)) continue;
    const key = `${band.rat}-${band.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (drCountsByBand.has(key)) result.set(key, Math.max(drCountsByBand.get(key)!, 1));
    else result.set(key, fallbackCount);
  }

  return result;
}

export function ukePermitsToCells(permits: UkePermitForCells[]): ProposedCellForm[] {
  const bandCounts = computeUkeBandCounts(permits);
  const seen = new Set<string>();
  const cells: ProposedCellForm[] = [];

  for (const permit of permits) {
    const band = permit.band;
    if (!band || !isEditableRat(band.rat)) continue;
    const key = `${band.rat}-${band.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const count = bandCounts.get(key) ?? 1;
    for (let i = 0; i < count; i++) {
      cells.push({
        id: generateCellId(),
        rat: band.rat,
        band_id: band.id,
        details: {},
      });
    }
  }

  cells.sort((a, b) => RAT_ORDER.indexOf(a.rat) - RAT_ORDER.indexOf(b.rat));

  return cells;
}
