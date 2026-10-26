import { type OperatorRef, conventionsFor, defaultLteEarfcn } from "@openbts/country-packs";
import type { Band } from "@openbts/shared/contract";

import { patchCell } from "./draftReducer";
import { DEFAULT_CELL_TYPE, getCellNumber } from "./ratFields";
import { createCellDraft } from "./snapshots";
import type { CellDraft, DraftKey, Rat } from "./types";
import { buildRemainingLTECells, supportsRemainingLTECells } from "@/features/cells/lib/remainingLteCells";
import { getBandDuplexMark } from "@/features/station-details/station/utils/bands";

export type CellToolId = "fillChannels" | "addMissingCells" | "assignSectorsByPci" | "confirmCells";
export type ConfirmScope = "all" | "new";

export type CellToolInput = {
  cells: readonly CellDraft[];
  rat: Rat;
  bandsById: ReadonlyMap<number, Band>;
  countryCode: string | null;
  operator: OperatorRef | null;
  confirmScope: ConfirmScope;
};

type CellToolOffer = {
  countryCode: string | null;
  operator: OperatorRef | null;
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
  if (tool === "fillChannels") return offer.operator !== null && offer.operator.primaryPlmn !== null;
  if (tool === "addMissingCells") return supportsRemainingLTECells(offer.countryCode, offer.operator);
  if (tool === "confirmCells") return offer.hasConfirmTool;
  return true;
}

export function listCellTools(rat: Rat, offer: CellToolOffer): CellToolId[] {
  return RAT_TOOLS[rat].filter((tool) => isOffered(tool, offer));
}

function isKeptLteCell(cell: CellDraft): boolean {
  return cell.rat === "lte" && !cell.isDeleted;
}

function isKeptNrCell(cell: CellDraft): boolean {
  return cell.rat === "nr" && !cell.isDeleted;
}

function hasEmptyChannel(cell: CellDraft): boolean {
  const channel = getCellNumber(cell, "earfcn");
  return channel === null || channel === 0;
}

export function fillLteChannels(cells: readonly CellDraft[], bandsById: ReadonlyMap<number, Band>, plmn: string | null): readonly CellDraft[] {
  if (plmn === null) return cells;

  const filled = cells.map((cell) => {
    if (!isKeptLteCell(cell) || !hasEmptyChannel(cell) || cell.bandId === null) return cell;

    const band = bandsById.get(cell.bandId);
    const duplex = getBandDuplexMark(band);
    if (band === undefined || band.labelMhz === null || duplex === null) return cell;

    const channel = defaultLteEarfcn(plmn, band.labelMhz, duplex === "TDD" ? "TDD" : "FDD");
    return channel === null ? cell : patchCell(cell, { numbers: { earfcn: channel } });
  });
  return keepUnchanged(cells, filled);
}

export function createSeriesCell(source: CellDraft, clid: number, countryCode: string | null): CellDraft {
  const tac = conventionsFor(countryCode).hoistedTac ? getCellNumber(source, "tac") : null;
  return createCellDraft("lte", {
    bandId: source.bandId,
    cellType: source.cellType ?? DEFAULT_CELL_TYPE,
    notes: source.notes,
    isConfirmed: source.isConfirmed,
    numbers: { ...source.numbers, clid, pci: null, tac },
    flags: { ...source.flags },
    extraPlmns: source.extraPlmns,
  });
}

export function addMissingLteCells(cells: readonly CellDraft[], countryCode: string | null, operator: OperatorRef | null): readonly CellDraft[] {
  const additions = buildRemainingLTECells<CellDraft>({
    countryCode,
    operator,
    cells: cells.filter(isKeptLteCell),
    getBandId: (cell) => cell.bandId,
    getDetails: (cell) => ({ enbid: getCellNumber(cell, "enbid"), clid: getCellNumber(cell, "clid") }),
    createCell: (source, clid) => createSeriesCell(source, clid, countryCode),
  });
  if (additions.length === 0) return cells;

  let insertIndex = 0;
  for (let index = cells.length - 1; index >= 0; index--) {
    if (cells[index]?.rat !== "lte") continue;
    insertIndex = index + 1;
    break;
  }
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

function fillNrFromLte(cells: readonly CellDraft[]): readonly CellDraft[] {
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
    if (!isKeptNrCell(cell) || cell.sectorKey !== null || pci === null) return cell;

    const sectorKey = lteSectorsByPci.get(pci) ?? null;
    return sectorKey === null ? cell : patchCell(cell, { sectorKey });
  });
}

export function assignSectorsByPci(cells: readonly CellDraft[], rat: Rat): readonly CellDraft[] {
  if (rat === "lte") return keepUnchanged(cells, fillFromSamePci(cells, isKeptLteCell));
  if (rat === "nr") return keepUnchanged(cells, fillNrFromLte(fillFromSamePci(cells, isKeptNrCell)));
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
  if (tool === "fillChannels") return fillLteChannels(input.cells, input.bandsById, input.operator?.primaryPlmn ?? null);
  if (tool === "addMissingCells") return addMissingLteCells(input.cells, input.countryCode, input.operator);
  if (tool === "assignSectorsByPci") return assignSectorsByPci(input.cells, input.rat);
  return confirmCells(input.cells, input.rat, input.confirmScope);
}
