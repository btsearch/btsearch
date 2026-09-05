import { getCellDetailKeys } from "@/features/shared/rat";
import type { Band } from "@/types/station";

import type { CellFormDetails, SubmissionFormData } from "../types";
import type { AnalyzerDraft } from "./analyzerDraftStore";
import {
  type AnalyzerBandChoice,
  type AnalyzerRat,
  type MismatchDetails,
  buildAnalyzerBaseDetails,
  buildAnalyzerProbableAddDetails,
  buildAnalyzerWarningDetails,
  resolveAnalyzerBandChoices,
} from "./analyzerRatSpecs";

export interface DraftCell {
  _rowIndex: number;
  operation: "add" | "update";
  rat: AnalyzerRat;
  target_cell_id: number | undefined;
  target_sector_id: number | undefined;
  band_id: number | null;
  duplexChoices: AnalyzerBandChoice[];
  details: MismatchDetails;
  baseDetails?: MismatchDetails;
  warningKeys: string[];
  conflict: boolean;
}

export interface DraftStation {
  stationInternalId: number;
  station_id: string;
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

function pickMismatchDetails(rat: AnalyzerRat, details: MismatchDetails) {
  const keys = getCellDetailKeys(rat);
  return Object.fromEntries(keys.filter((key) => key in details).map((key) => [key, details[key as keyof MismatchDetails]]));
}

export function buildAnalyzerBatchDraft(draft: AnalyzerDraft, bands: Band[] = []): AnalyzerBatchDraft {
  const stationMap = new Map<number, DraftStation>();
  const cellConflictTracker = new Map<string, MismatchDetails>();
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
    let duplexChoices: AnalyzerBandChoice[] = [];

    if (result.status === "found" && result.cell) {
      const cell = result.cell;
      if (cell.rat !== "NR") {
        target_cell_id = cell.cell_id;
        target_sector_id = cell.sector_id ?? undefined;
        band_id = cell.band_id ?? null;
      }

      if (cell.rat === row.rat) {
        baseDetails = buildAnalyzerBaseDetails(cell.rat, cell);
        Object.assign(details, buildAnalyzerWarningDetails(row.rat, row, warnings));
      }
    } else if (result.status === "probable" && warnings.includes("enbid_only") && row.rat === "LTE" && result.cell) {
      operation = "add";
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
      baseDetails = buildAnalyzerBaseDetails(cell.rat, cell);
      Object.assign(details, buildAnalyzerWarningDetails(row.rat, row, warnings));
    }

    let conflict = false;
    if (target_cell_id !== undefined) {
      const conflictKey = `${stationInternalId}:${target_cell_id}`;
      const seen = cellConflictTracker.get(conflictKey);
      if (seen) {
        conflict = (Object.keys(details) as (keyof MismatchDetails)[]).some((k) => k in seen && seen[k] !== details[k]);
        Object.assign(seen, details);
      } else cellConflictTracker.set(conflictKey, details);
    }
    const changedCell: DraftCell = {
      _rowIndex: idx,
      operation,
      rat: row.rat,
      target_cell_id,
      target_sector_id,
      band_id,
      duplexChoices,
      details,
      baseDetails,
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
  return draft.stations.map((station) => ({
    station_id: station.stationInternalId,
    type: "update",
    cells: station.cells.map((cell) => ({
      operation: cell.operation,
      target_cell_id: cell.target_cell_id,
      target_sector_id: cell.target_sector_id,
      band_id: cell.band_id,
      rat: cell.rat,
      details: {
        ...pickMismatchDetails(cell.rat, cell.baseDetails ?? {}),
        ...pickMismatchDetails(cell.rat, cell.details),
      } as Partial<CellFormDetails>,
    })),
  }));
}
