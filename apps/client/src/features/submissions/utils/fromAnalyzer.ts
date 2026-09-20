import type { CellFormDetails, SubmissionFormData } from "../types";
import type { AnalyzerDraft } from "./analyzerDraftStore";
import {
  type AnalyzerBandChoice,
  type AnalyzerDetailKey,
  type AnalyzerRat,
  type MismatchDetails,
  buildAnalyzerBaseDetails,
  buildAnalyzerProbableAddDetails,
  buildAnalyzerWarningDetails,
  resolveAnalyzerBandChoices,
} from "./analyzerRatSpecs";
import { DEFAULT_CELL_TYPE } from "@/features/shared/cellTypes";
import { getCellDetailKeys } from "@/features/shared/rat";
import type { Band, CellType } from "@/types/station";

export interface DraftCell {
  _rowIndex: number;
  operation: "add" | "update";
  rat: AnalyzerRat;
  target_cell_id: number | undefined;
  target_sector_id: number | undefined;
  band_id: number | null;
  type?: CellType | null;
  baseType: CellType | null | undefined;
  duplexChoices: AnalyzerBandChoice[];
  details: MismatchDetails;
  baseDetails?: MismatchDetails;
  selectedDetailKeys: ReadonlySet<AnalyzerDetailKey>;
  warningKeys: string[];
  conflict: boolean;
}

export interface DraftStation {
  stationInternalId: number;
  station_id: string;
  operatorName: string | null;
  operatorMnc: number | null;
  cells: DraftCell[];
  hasConflicts: boolean;
}

export interface AnalyzerBatchDraft {
  stations: DraftStation[];
  metadata: {
    fileName?: string | null;
    fileFormat?: string | null;
    parsedRows: number;
  };
  unresolvedBandRows: number[];
}

type AnalyzerCellConflictState = Pick<DraftCell, "details" | "type">;

function getSelectedAnalyzerDetails(cell: Pick<DraftCell, "details" | "selectedDetailKeys">): MismatchDetails {
  const details: MismatchDetails = {};
  for (const key of cell.selectedDetailKeys) {
    if (!(key in cell.details)) continue;
    Object.assign(details, { [key]: cell.details[key] });
  }
  return details;
}

export function isAnalyzerCellIncluded(cell: Pick<DraftCell, "operation" | "selectedDetailKeys" | "type" | "baseType">): boolean {
  return cell.operation === "add" || cell.selectedDetailKeys.size > 0 || cell.type !== cell.baseType;
}

function getAnalyzerCellConflictState(cell: DraftCell): AnalyzerCellConflictState {
  return {
    details: getSelectedAnalyzerDetails(cell),
    type: cell.type === cell.baseType ? undefined : cell.type,
  };
}

function hasAnalyzerCellConflict(seen: AnalyzerCellConflictState, cell: AnalyzerCellConflictState): boolean {
  const hasTypeConflict = seen.type !== undefined && cell.type !== undefined && seen.type !== cell.type;
  return (
    hasTypeConflict ||
    (Object.keys(cell.details) as (keyof MismatchDetails)[]).some((key) => key in seen.details && seen.details[key] !== cell.details[key])
  );
}

function mergeAnalyzerCellConflictState(seen: AnalyzerCellConflictState, cell: AnalyzerCellConflictState): AnalyzerCellConflictState {
  return {
    details: { ...seen.details, ...cell.details },
    type: cell.type === undefined ? seen.type : cell.type,
  };
}

export function recalculateAnalyzerCellConflicts(cells: DraftCell[]): DraftCell[] {
  const stateByTargetCell = new Map<number, AnalyzerCellConflictState>();

  return cells.map((cell) => {
    if (cell.target_cell_id === undefined || !isAnalyzerCellIncluded(cell)) return cell.conflict ? { ...cell, conflict: false } : cell;

    const seen = stateByTargetCell.get(cell.target_cell_id);
    const current = getAnalyzerCellConflictState(cell);
    const conflict = seen !== undefined && hasAnalyzerCellConflict(seen, current);

    stateByTargetCell.set(cell.target_cell_id, seen === undefined ? current : mergeAnalyzerCellConflictState(seen, current));
    return cell.conflict === conflict ? cell : { ...cell, conflict };
  });
}

function pickMismatchDetails(rat: AnalyzerRat, details: MismatchDetails): Partial<CellFormDetails> {
  const keys = getCellDetailKeys(rat);
  return Object.fromEntries(keys.filter((key) => key in details).map((key) => [key, details[key as keyof MismatchDetails]]));
}

export function buildAnalyzerBatchDraft(draft: AnalyzerDraft, bands: Band[] = []): AnalyzerBatchDraft {
  const stationMap = new Map<number, DraftStation>();
  const cellConflictTracker = new Map<string, AnalyzerCellConflictState>();
  const unresolvedBandRows: number[] = [];

  for (const { index: idx, parsedRow: row, result } of draft.selectedRows) {
    if (result.status !== "found" && result.status !== "probable") continue;
    if (!result.station) continue;

    const stationInternalId = result.station.id;
    const warnings: string[] = result.warnings ?? [];
    const details: MismatchDetails = {};
    let baseDetails: MismatchDetails | undefined;
    let operation: "add" | "update" = "update";
    let target_cell_id: number | undefined;
    let target_sector_id: number | undefined;
    let band_id: number | null = null;
    let type: CellType | null | undefined;
    let duplexChoices: AnalyzerBandChoice[] = [];

    if (result.status === "found" && result.cell) {
      const cell = result.cell;
      if (cell.rat !== "NR") {
        target_cell_id = cell.cell_id;
        target_sector_id = cell.sector_id ?? undefined;
        band_id = cell.band_id ?? null;
        type = cell.type;
      }

      if (cell.rat === row.rat) {
        baseDetails = buildAnalyzerBaseDetails(cell.rat, cell);
        Object.assign(details, buildAnalyzerWarningDetails(row.rat, row, warnings));
      }
    } else if (result.status === "probable" && warnings.includes("enbid_only") && row.rat === "LTE" && result.cell) {
      operation = "add";
      type = DEFAULT_CELL_TYPE;
      Object.assign(details, buildAnalyzerProbableAddDetails(row.rat, row));
      const resolvedBand = resolveAnalyzerBandChoices(row.rat, details, bands);
      band_id = resolvedBand.band_id;
      duplexChoices = resolvedBand.duplexChoices;
      if (!band_id && duplexChoices.length === 0) unresolvedBandRows.push(idx);
    } else if (result.status === "probable" && warnings.includes("rnc_mismatch") && result.cell?.rat === "UMTS" && row.rat === "UMTS") {
      const cell = result.cell;
      target_cell_id = cell?.cell_id;
      target_sector_id = cell?.sector_id ?? undefined;
      band_id = cell?.band_id ?? null;
      type = cell.type;
      baseDetails = buildAnalyzerBaseDetails(cell.rat, cell);
      Object.assign(details, buildAnalyzerWarningDetails(row.rat, row, warnings));
    }

    let conflict = false;
    if (target_cell_id !== undefined) {
      const conflictKey = `${stationInternalId}:${target_cell_id}`;
      const seen = cellConflictTracker.get(conflictKey);
      const current = { details, type };
      if (seen) {
        conflict = hasAnalyzerCellConflict(seen, current);
        cellConflictTracker.set(conflictKey, mergeAnalyzerCellConflictState(seen, current));
      } else cellConflictTracker.set(conflictKey, current);
    }
    const changedCell: DraftCell = {
      _rowIndex: idx,
      operation,
      rat: row.rat,
      target_cell_id,
      target_sector_id,
      band_id,
      type,
      baseType: type,
      duplexChoices,
      details,
      baseDetails,
      selectedDetailKeys: new Set(Object.keys(details) as AnalyzerDetailKey[]),
      warningKeys: warnings,
      conflict,
    };

    const existing = stationMap.get(stationInternalId);
    if (existing) {
      existing.cells.push(changedCell);
      if (conflict) existing.hasConflicts = true;
    } else {
      stationMap.set(stationInternalId, {
        stationInternalId,
        station_id: result.station.station_id,
        operatorName: result.station.operator.name,
        operatorMnc: result.station.operator?.mnc ?? null,
        cells: [changedCell],
        hasConflicts: conflict,
      });
    }
  }

  return {
    stations: [...stationMap.values()],
    metadata: {
      fileName: draft.metadata.fileName,
      fileFormat: draft.metadata.fileFormat,
      parsedRows: draft.parsedCount,
    },
    unresolvedBandRows,
  };
}

export function buildSubmissionPayloads(draft: AnalyzerBatchDraft): SubmissionFormData[] {
  return draft.stations.flatMap((station) => {
    const cells = station.cells.filter(isAnalyzerCellIncluded).map((cell) => ({
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      target_sector_id: cell.target_sector_id,
      band_id: cell.band_id,
      rat: cell.rat,
      type: cell.operation === "add" || cell.type !== cell.baseType ? cell.type : undefined,
      details: pickMismatchDetails(cell.rat, getSelectedAnalyzerDetails(cell)),
    }));
    if (cells.length === 0) return [];
    return [{ station_id: station.stationInternalId, type: "update" as const, cells }];
  });
}
