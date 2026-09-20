import type { AnalyzerDraft } from "./analyzerDraftStore";
import { type AnalyzerDetailKey, type AnalyzerRat, isAnalyzerDetailRequired } from "./analyzerRatSpecs";
import {
  type AnalyzerBatchDraft,
  type DraftCell,
  type DraftStation,
  buildAnalyzerBatchDraft,
  recalculateAnalyzerCellConflicts,
} from "./fromAnalyzer";
import type { Band, CellType } from "@/types/station";

export type StationReviewEntry = {
  base: DraftStation;
  visible: DraftStation | null;
  removed: boolean;
  removedCells: ReadonlySet<number>;
  duplexSelections: ReadonlyMap<number, string | null>;
  cellTypeSelections: ReadonlyMap<number, CellType | null>;
  detailSelections: ReadonlyMap<number, ReadonlySet<AnalyzerDetailKey>>;
};

export type AnalyzerReviewState = {
  initialBatchDraft: AnalyzerBatchDraft;
  stationEntries: readonly StationReviewEntry[];
};

export type AnalyzerReviewAction =
  | { type: "set-duplex"; stationId: number; rowIndex: number; duplex: string | null }
  | { type: "set-cell-type"; stationId: number; rowIndex: number; cellType: CellType | null }
  | { type: "set-detail-selected"; stationId: number; rowIndex: number; key: AnalyzerDetailKey; selected: boolean }
  | { type: "set-detail-selected-for-all"; rat: AnalyzerRat; key: AnalyzerDetailKey; selected: boolean }
  | { type: "set-all-optional-details"; selected: boolean }
  | { type: "remove-cell"; stationId: number; rowIndex: number }
  | { type: "remove-station"; stationId: number }
  | { type: "restore-removals" };

export type AnalyzerReviewSource = {
  draft: AnalyzerDraft;
  bands: Band[];
};

const EMPTY_REMOVED_CELLS: ReadonlySet<number> = new Set();
const EMPTY_DUPLEX_SELECTIONS: ReadonlyMap<number, string | null> = new Map();
const EMPTY_CELL_TYPE_SELECTIONS: ReadonlyMap<number, CellType | null> = new Map();
const EMPTY_DETAIL_SELECTIONS: ReadonlyMap<number, ReadonlySet<AnalyzerDetailKey>> = new Map();

function rebuildVisibleStation(
  base: DraftStation,
  removed: boolean,
  removedCells: ReadonlySet<number>,
  duplexSelections: ReadonlyMap<number, string | null>,
  cellTypeSelections: ReadonlyMap<number, CellType | null>,
  detailSelections: ReadonlyMap<number, ReadonlySet<AnalyzerDetailKey>>,
): DraftStation | null {
  if (removed) return null;
  if (removedCells.size === 0 && duplexSelections.size === 0 && cellTypeSelections.size === 0 && detailSelections.size === 0) return base;

  const visibleCells: DraftCell[] = [];
  for (const cell of base.cells) {
    if (removedCells.has(cell._rowIndex)) continue;

    let visibleCell = cell;
    const selectedDuplex = duplexSelections.get(cell._rowIndex);
    if (selectedDuplex !== undefined && cell.duplexChoices.length > 0) {
      const bandId = cell.duplexChoices.find((choice) => choice.duplex === selectedDuplex)?.band_id ?? null;
      if (bandId !== cell.band_id) visibleCell = { ...visibleCell, band_id: bandId };
    }

    const selectedCellType = cellTypeSelections.get(cell._rowIndex);
    if (selectedCellType !== undefined && selectedCellType !== cell.type) visibleCell = { ...visibleCell, type: selectedCellType };

    const selectedDetailKeys = detailSelections.get(cell._rowIndex);
    if (selectedDetailKeys !== undefined && selectedDetailKeys !== cell.selectedDetailKeys) visibleCell = { ...visibleCell, selectedDetailKeys };

    visibleCells.push(visibleCell);
  }

  if (visibleCells.length === 0) return null;
  const cells = recalculateAnalyzerCellConflicts(visibleCells);
  return { ...base, cells, hasConflicts: cells.some((cell) => cell.conflict) };
}

function rebuildEntry(
  entry: StationReviewEntry,
  updates: Partial<Pick<StationReviewEntry, "removed" | "removedCells" | "duplexSelections" | "cellTypeSelections" | "detailSelections">>,
): StationReviewEntry {
  const removed = updates.removed ?? entry.removed;
  const removedCells = updates.removedCells ?? entry.removedCells;
  const duplexSelections = updates.duplexSelections ?? entry.duplexSelections;
  const cellTypeSelections = updates.cellTypeSelections ?? entry.cellTypeSelections;
  const detailSelections = updates.detailSelections ?? entry.detailSelections;
  return {
    ...entry,
    removed,
    removedCells,
    duplexSelections,
    cellTypeSelections,
    detailSelections,
    visible: rebuildVisibleStation(entry.base, removed, removedCells, duplexSelections, cellTypeSelections, detailSelections),
  };
}

function setEntryDetailSelection(
  entry: StationReviewEntry,
  matches: (cell: DraftCell, key: AnalyzerDetailKey) => boolean,
  selected: boolean,
): StationReviewEntry {
  if (entry.removed) return entry;

  let detailSelections: Map<number, ReadonlySet<AnalyzerDetailKey>> | undefined;
  for (const cell of entry.base.cells) {
    if (entry.removedCells.has(cell._rowIndex)) continue;
    for (const key of Object.keys(cell.details) as AnalyzerDetailKey[]) {
      if (!matches(cell, key) || isAnalyzerDetailRequired(cell.operation, cell.rat, key)) continue;
      const current = detailSelections?.get(cell._rowIndex) ?? entry.detailSelections.get(cell._rowIndex) ?? cell.selectedDetailKeys;
      if (current.has(key) === selected) continue;

      detailSelections ??= new Map(entry.detailSelections);
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      const isBaseSelection = next.size === cell.selectedDetailKeys.size && [...next].every((detailKey) => cell.selectedDetailKeys.has(detailKey));
      if (isBaseSelection) detailSelections.delete(cell._rowIndex);
      else detailSelections.set(cell._rowIndex, next);
    }
  }

  return detailSelections === undefined ? entry : rebuildEntry(entry, { detailSelections });
}

function replaceStationEntry(
  state: AnalyzerReviewState,
  stationId: number,
  update: (entry: StationReviewEntry) => StationReviewEntry,
): AnalyzerReviewState {
  const index = state.stationEntries.findIndex((entry) => entry.base.stationInternalId === stationId);
  if (index < 0) return state;

  const current = state.stationEntries[index];
  const next = update(current);
  if (next === current) return state;

  const stationEntries = [...state.stationEntries];
  stationEntries[index] = next;
  return { ...state, stationEntries };
}

export function createAnalyzerReviewState({ draft, bands }: AnalyzerReviewSource): AnalyzerReviewState {
  const initialBatchDraft = buildAnalyzerBatchDraft(draft, bands);
  return {
    initialBatchDraft,
    stationEntries: initialBatchDraft.stations.map((station) => ({
      base: station,
      visible: station,
      removed: false,
      removedCells: EMPTY_REMOVED_CELLS,
      duplexSelections: EMPTY_DUPLEX_SELECTIONS,
      cellTypeSelections: EMPTY_CELL_TYPE_SELECTIONS,
      detailSelections: EMPTY_DETAIL_SELECTIONS,
    })),
  };
}

export function analyzerReviewReducer(state: AnalyzerReviewState, action: AnalyzerReviewAction): AnalyzerReviewState {
  switch (action.type) {
    case "set-duplex":
      return replaceStationEntry(state, action.stationId, (entry) => {
        if (entry.duplexSelections.has(action.rowIndex) && entry.duplexSelections.get(action.rowIndex) === action.duplex) return entry;
        const duplexSelections = new Map(entry.duplexSelections);
        duplexSelections.set(action.rowIndex, action.duplex);
        return rebuildEntry(entry, { duplexSelections });
      });
    case "set-cell-type":
      return replaceStationEntry(state, action.stationId, (entry) => {
        if (entry.cellTypeSelections.has(action.rowIndex) && entry.cellTypeSelections.get(action.rowIndex) === action.cellType) return entry;
        const cellTypeSelections = new Map(entry.cellTypeSelections);
        cellTypeSelections.set(action.rowIndex, action.cellType);
        return rebuildEntry(entry, { cellTypeSelections });
      });
    case "set-detail-selected":
      return replaceStationEntry(state, action.stationId, (entry) =>
        setEntryDetailSelection(entry, (cell, key) => cell._rowIndex === action.rowIndex && key === action.key, action.selected),
      );
    case "set-detail-selected-for-all": {
      let changed = false;
      const stationEntries = state.stationEntries.map((entry) => {
        const next = setEntryDetailSelection(entry, (cell, key) => cell.rat === action.rat && key === action.key, action.selected);
        if (next !== entry) changed = true;
        return next;
      });
      return changed ? { ...state, stationEntries } : state;
    }
    case "set-all-optional-details": {
      let changed = false;
      const stationEntries = state.stationEntries.map((entry) => {
        const next = setEntryDetailSelection(entry, () => true, action.selected);
        if (next !== entry) changed = true;
        return next;
      });
      return changed ? { ...state, stationEntries } : state;
    }
    case "remove-cell":
      return replaceStationEntry(state, action.stationId, (entry) => {
        if (entry.removedCells.has(action.rowIndex)) return entry;
        const removedCells = new Set(entry.removedCells);
        removedCells.add(action.rowIndex);
        return rebuildEntry(entry, { removedCells });
      });
    case "remove-station":
      return replaceStationEntry(state, action.stationId, (entry) => (entry.removed ? entry : rebuildEntry(entry, { removed: true })));
    case "restore-removals": {
      let changed = false;
      const stationEntries = state.stationEntries.map((entry) => {
        if (!entry.removed && entry.removedCells.size === 0) return entry;
        changed = true;
        return rebuildEntry(entry, { removed: false, removedCells: EMPTY_REMOVED_CELLS });
      });
      return changed ? { ...state, stationEntries } : state;
    }
  }
}
