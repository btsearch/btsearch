import type { Band } from "@openbts/shared/contract";

import { patchCell } from "./draftReducer";
import { DEFAULT_CELL_TYPE, getCellNumber } from "./ratFields";
import { createCellDraft } from "./snapshots";
import type { CellDraft, DraftKey, Rat } from "./types";
import { getKnownEARFCN } from "@/features/cells/lib/earfcnFill";
import { buildRemainingLTECells, supportsRemainingLTECells } from "@/features/cells/lib/remainingLteCells";
import { getBandDuplexMark } from "@/features/station-details/station/utils/bands";

export type CellToolId = "fillChannels" | "addMissingCells" | "assignSectorsByPci" | "confirmCells";
export type ConfirmScope = "all" | "new";

export type CellToolInput = {
  cells: readonly CellDraft[];
  rat: Rat;
  bandsById: ReadonlyMap<number, Band>;
  operatorMnc: number | null;
  confirmScope: ConfirmScope;
};

type CellToolOffer = {
  operatorMnc: number | null;
  hasConfirmTool: boolean;
};

type CellTest = (cell: CellDraft) => boolean;

const RAT_TOOLS: Record<Rat, readonly CellToolId[]> = {
  nr: ["assignSectorsByPci", "confirmCells"],
  lte: ["fillChannels", "addMissingCells", "assignSectorsByPci", "confirmCells"],
  umts: ["confirmCells"],
  gsm: ["confirmCells"],
};

function keepUnchanged(cells: readonly CellDraft[], next: readonly CellDraft[]): readonly CellDraft[] {
  return next.length === cells.length && next.every((cell, index) => cell === cells[index]) ? cells : next;
}

function isOffered(tool: CellToolId, offer: CellToolOffer): boolean {
  if (tool === "fillChannels") return offer.operatorMnc !== null;
  if (tool === "addMissingCells") return supportsRemainingLTECells(offer.operatorMnc);
  if (tool === "confirmCells") return offer.hasConfirmTool;
  return true;
}

export function listCellTools(rat: Rat, offer: CellToolOffer): CellToolId[] {
  return RAT_TOOLS[rat].filter((tool) => isOffered(tool, offer));
}

function isKeptLteCell(cell: CellDraft): boolean {
  return cell.rat === "lte" && !cell.isDeleted;
}

function isKeptStandaloneCell(cell: CellDraft): boolean {
  return cell.rat === "nr" && cell.mode === "sa" && !cell.isDeleted;
}

function isNonStandaloneTarget(cell: CellDraft): boolean {
  return cell.rat === "nr" && cell.mode !== "sa" && !cell.isDeleted && cell.sectorKey === null;
}

function hasEmptyChannel(cell: CellDraft): boolean {
  const channel = getCellNumber(cell, "earfcn");
  return channel === null || channel === 0;
}

export function fillLteChannels(cells: readonly CellDraft[], bandsById: ReadonlyMap<number, Band>, operatorMnc: number | null): readonly CellDraft[] {
  const filled = cells.map((cell) => {
    if (!isKeptLteCell(cell) || !hasEmptyChannel(cell) || cell.bandId === null) return cell;

    const band = bandsById.get(cell.bandId);
    const channel = band === undefined ? null : getKnownEARFCN(operatorMnc, band.labelMhz, getBandDuplexMark(band));
    return channel === null ? cell : patchCell(cell, { numbers: { earfcn: channel } });
  });
  return keepUnchanged(cells, filled);
}

function createSeriesCell(source: CellDraft, clid: number): CellDraft {
  return createCellDraft("lte", {
    bandId: source.bandId,
    cellType: source.cellType ?? DEFAULT_CELL_TYPE,
    notes: source.notes,
    isConfirmed: source.isConfirmed,
    numbers: { ...source.numbers, clid, pci: null },
    flags: { ...source.flags },
  });
}

export function addMissingLteCells(cells: readonly CellDraft[], operatorMnc: number | null): readonly CellDraft[] {
  const additions = buildRemainingLTECells<CellDraft>({
    operatorMnc,
    cells: cells.filter(isKeptLteCell),
    getBandId: (cell) => cell.bandId,
    getDetails: (cell) => ({ enbid: getCellNumber(cell, "enbid"), clid: getCellNumber(cell, "clid") }),
    createCell: createSeriesCell,
  });
  if (additions.length === 0) return cells;

  const insertIndex = cells.findLastIndex((cell) => cell.rat === "lte") + 1;
  return [...cells.slice(0, insertIndex), ...additions, ...cells.slice(insertIndex)];
}

function fillFromSamePci(cells: readonly CellDraft[], isMember: CellTest): readonly CellDraft[] {
  const sectorsByPci = new Map<number, DraftKey>();
  for (const cell of cells) {
    const pci = getCellNumber(cell, "pci");
    if (!isMember(cell) || pci === null || cell.sectorKey === null || sectorsByPci.has(pci)) continue;
    sectorsByPci.set(pci, cell.sectorKey);
  }
  if (sectorsByPci.size === 0) return cells;

  return cells.map((cell) => {
    const pci = getCellNumber(cell, "pci");
    if (!isMember(cell) || cell.sectorKey !== null || pci === null) return cell;

    const sectorKey = sectorsByPci.get(pci);
    return sectorKey === undefined ? cell : patchCell(cell, { sectorKey });
  });
}

function fillNonStandaloneFromLte(cells: readonly CellDraft[]): readonly CellDraft[] {
  const lteSectorsByPci = new Map<number, DraftKey | null>();
  for (const cell of cells) {
    const pci = getCellNumber(cell, "pci");
    if (!isKeptLteCell(cell) || pci === null || cell.sectorKey === null) continue;

    const known = lteSectorsByPci.get(pci);
    if (known === undefined) lteSectorsByPci.set(pci, cell.sectorKey);
    else if (known !== cell.sectorKey) lteSectorsByPci.set(pci, null);
  }
  if (lteSectorsByPci.size === 0) return cells;

  return cells.map((cell) => {
    const pci = getCellNumber(cell, "pci");
    if (!isNonStandaloneTarget(cell) || pci === null) return cell;

    const sectorKey = lteSectorsByPci.get(pci) ?? null;
    return sectorKey === null ? cell : patchCell(cell, { sectorKey });
  });
}

export function assignSectorsByPci(cells: readonly CellDraft[], rat: Rat): readonly CellDraft[] {
  if (rat === "lte") return keepUnchanged(cells, fillFromSamePci(cells, isKeptLteCell));
  if (rat === "nr") return keepUnchanged(cells, fillNonStandaloneFromLte(fillFromSamePci(cells, isKeptStandaloneCell)));
  return cells;
}

export function confirmCells(cells: readonly CellDraft[], rat: Rat, scope: ConfirmScope): readonly CellDraft[] {
  const confirmed = cells.map((cell) => {
    const isInScope = cell.rat === rat && !cell.isDeleted && (scope === "all" || cell.id === null);
    return isInScope ? patchCell(cell, { isConfirmed: true }) : cell;
  });
  return keepUnchanged(cells, confirmed);
}

export function runCellTool(tool: CellToolId, input: CellToolInput): readonly CellDraft[] {
  if (tool === "fillChannels") return fillLteChannels(input.cells, input.bandsById, input.operatorMnc);
  if (tool === "addMissingCells") return addMissingLteCells(input.cells, input.operatorMnc);
  if (tool === "assignSectorsByPci") return assignSectorsByPci(input.cells, input.rat);
  return confirmCells(input.cells, input.rat, input.confirmScope);
}
