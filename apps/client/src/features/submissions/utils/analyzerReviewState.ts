import type { AnalyzerDraft } from "./analyzerDraftStore";
import {
  type AnalyzerBatchDraft,
  type DraftCell,
  type DraftStation,
  buildAnalyzerBatchDraft,
  recalculateAnalyzerCellConflicts,
} from "./fromAnalyzer";
import type { Band } from "@/types/station";

export type StationReviewEntry = {
  base: DraftStation;
  visible: DraftStation | null;
  removed: boolean;
  removedCells: ReadonlySet<number>;
  duplexSelections: ReadonlyMap<number, string | null>;
};

export type AnalyzerReviewState = {
  initialBatchDraft: AnalyzerBatchDraft;
  stationEntries: readonly StationReviewEntry[];
};

export type AnalyzerReviewAction =
  | { type: "set-duplex"; stationId: number; rowIndex: number; duplex: string | null }
  | { type: "remove-cell"; stationId: number; rowIndex: number }
  | { type: "remove-station"; stationId: number }
  | { type: "restore-removals" };

export type AnalyzerReviewSource = {
  draft: AnalyzerDraft;
  bands: Band[];
};

const EMPTY_REMOVED_CELLS: ReadonlySet<number> = new Set();
const EMPTY_DUPLEX_SELECTIONS: ReadonlyMap<number, string | null> = new Map();

function rebuildVisibleStation(
  base: DraftStation,
  removed: boolean,
  removedCells: ReadonlySet<number>,
  duplexSelections: ReadonlyMap<number, string | null>,
): DraftStation | null {
  if (removed) return null;
  if (removedCells.size === 0 && duplexSelections.size === 0) return base;

  const visibleCells: DraftCell[] = [];
  for (const cell of base.cells) {
    if (removedCells.has(cell._rowIndex)) continue;

    const selectedDuplex = duplexSelections.get(cell._rowIndex);
    if (selectedDuplex === undefined || cell.duplexChoices.length === 0) {
      visibleCells.push(cell);
      continue;
    }

    const bandId = cell.duplexChoices.find((choice) => choice.duplex === selectedDuplex)?.band_id ?? null;
    visibleCells.push(bandId === cell.band_id ? cell : { ...cell, band_id: bandId });
  }

  if (visibleCells.length === 0) return null;
  const cells = recalculateAnalyzerCellConflicts(visibleCells);
  return { ...base, cells, hasConflicts: cells.some((cell) => cell.conflict) };
}

function rebuildEntry(
  entry: StationReviewEntry,
  updates: Partial<Pick<StationReviewEntry, "removed" | "removedCells" | "duplexSelections">>,
): StationReviewEntry {
  const removed = updates.removed ?? entry.removed;
  const removedCells = updates.removedCells ?? entry.removedCells;
  const duplexSelections = updates.duplexSelections ?? entry.duplexSelections;
  return {
    ...entry,
    removed,
    removedCells,
    duplexSelections,
    visible: rebuildVisibleStation(entry.base, removed, removedCells, duplexSelections),
  };
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
