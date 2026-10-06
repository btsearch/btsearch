import type { Cell, CellDifference, CellMatchReason, CellMatchResult, ObservedCell } from "@openbts/shared/contract";

import { getBandFacetKey, resolveLogBandId } from "./bands";
import { toObservedCell } from "./observed";
import type {
  AnalyzerFile,
  AnalyzerLookups,
  ChipKind,
  DifferenceKind,
  IdChip,
  IdChipLines,
  LogFormat,
  LogRow,
  MatchResults,
  MatchTables,
  RowFacts,
  RowStatus,
  TickState,
} from "./types";
import { CELL_NUMBER_LABELS } from "@/features/station-editing/model/ratFields";
import type { ParsedRow } from "@/lib/analyzer/analyzerParsers";

type LogRows = { rows: LogRow[]; droppedCount: number };
type FileSource = { name: string; sizeBytes: number; format: LogFormat; skippedObservations: number };
type ChipField = keyof typeof CELL_NUMBER_LABELS;

export type FactsInput = {
  rows: readonly LogRow[];
  results: MatchResults | null;
  tables: MatchTables;
  lookups: AnalyzerLookups | null;
  isStaff: boolean;
};

const NCI_CHIP_FIELD = "nci";
const NCI_CHIP_LABEL = "NCI";
const NOT_FOUND_KINDS: Record<CellMatchReason, DifferenceKind> = {
  cellUnknown: "unknown-cell",
  operatorUnknown: "unknown-operator",
  noIdentifiers: "no-identifiers",
};

export function toLogRows(parsed: readonly ParsedRow[]): LogRows {
  const rows: LogRow[] = [];
  let droppedCount = 0;

  for (const parsedRow of parsed) {
    const observed = toObservedCell(parsedRow);
    if (observed === null) droppedCount += 1;
    else rows.push({ index: rows.length, observed, description: parsedRow.description });
  }
  return { rows, droppedCount };
}

export function describeAnalyzerFile(source: FileSource, logRows: LogRows): AnalyzerFile {
  const [firstRow] = logRows.rows;

  return {
    name: source.name,
    sizeBytes: source.sizeBytes,
    format: source.format,
    rowCount: logRows.rows.length,
    skippedCount: source.skippedObservations + logRows.droppedCount,
    hasOneDescription: firstRow !== undefined && logRows.rows.every((row) => row.description === firstRow.description),
  };
}

export function getRowStatus(result: CellMatchResult | null): RowStatus {
  if (result === null) return "pending";
  if (result.match === "none") return "notFound";
  return result.match === "cell" && !result.isShared ? "found" : "probable";
}

function toDifferenceKind(difference: CellDifference): DifferenceKind {
  return difference.stored === null ? `no-${difference.field}` : difference.field;
}

export function listDifferenceKinds(result: CellMatchResult): DifferenceKind[] {
  if (result.match === "none") return [NOT_FOUND_KINDS[result.reason ?? "cellUnknown"]];

  const kinds: DifferenceKind[] = [];
  if (result.isShared) kinds.push("shared");
  if (result.match === "cellByLac") kinds.push("by-lac");
  if (result.match === "station") kinds.push("new");
  for (const difference of result.differences) kinds.push(toDifferenceKind(difference));
  return kinds;
}

export function getTickState(result: CellMatchResult | null, storedCell: Cell | undefined, isStaff: boolean): TickState {
  if (result === null) return { canTick: false, reason: "pending" };
  if (result.match === "none") return { canTick: false, reason: result.reason ?? "cellUnknown" };
  if (result.isShared) return { canTick: false, reason: "shared" };
  if (result.match === "station") return { canTick: true, action: "create" };
  if (result.differences.length > 0) return { canTick: true, action: "update" };

  const canConfirm = result.match === "cell" && isStaff && storedCell !== undefined && !storedCell.isConfirmed;
  return canConfirm ? { canTick: true, action: "confirm" } : { canTick: false, reason: "noDifferences" };
}

export function findStoredCell(result: CellMatchResult | null, tables: MatchTables): Cell | undefined {
  return result === null || result.cellId === null ? undefined : tables.cellsById.get(result.cellId);
}

export function findRowOperatorId(
  row: LogRow,
  result: CellMatchResult | null,
  operatorIdByPlmn: ReadonlyMap<string, number> | undefined,
): number | null {
  return result === null ? (operatorIdByPlmn?.get(row.observed.plmn) ?? null) : result.operatorId;
}

function buildOneRowFacts(row: LogRow, result: CellMatchResult | null, input: FactsInput): RowFacts {
  const { lookups, tables } = input;
  const storedCell = findStoredCell(result, tables);
  const operatorId = findRowOperatorId(row, result, lookups?.operatorIdByPlmn);
  const countryCode = operatorId === null ? null : (lookups?.operatorsById.get(operatorId)?.operator.countryCode ?? null);

  let bandId: number | null = null;
  if (result !== null && result.cellId !== null) bandId = storedCell?.bandId ?? null;
  else if (lookups !== null) bandId = resolveLogBandId(row.observed, countryCode, lookups);

  return {
    operatorId,
    countryCode,
    rat: row.observed.rat,
    bandId,
    bandKey: getBandFacetKey(bandId === null ? undefined : lookups?.bandsById.get(bandId)),
    status: getRowStatus(result),
    kinds: result === null ? [] : listDifferenceKinds(result),
    tick: getTickState(result, storedCell, input.isStaff),
    stationId: result?.stationId ?? null,
    isUnconfirmed: storedCell !== undefined && !storedCell.isConfirmed,
  };
}

export function buildRowFacts(input: FactsInput): RowFacts[] {
  return input.rows.map((row, position) => buildOneRowFacts(row, input.results?.[position] ?? null, input));
}

function toChip(field: ChipField, value: number | null | undefined, result: CellMatchResult | null, isNewCellValue: boolean): IdChip[] {
  if (value === null || value === undefined) return [];

  const label = CELL_NUMBER_LABELS[field];
  const difference = result?.differences.find((entry) => entry.field === field);
  if (difference !== undefined) return [{ field, label, value, kind: difference.stored === null ? "added" : "changed", stored: difference.stored }];

  const kind: ChipKind = isNewCellValue && result?.match === "station" ? "added" : "same";
  return [{ field, label, value, kind, stored: null }];
}

function buildNrIdentityChips(observed: Extract<ObservedCell, { rat: "nr" }>, result: CellMatchResult | null): IdChip[] {
  const identity = result?.nrIdentity ?? null;
  if (identity !== null) return [...toChip("gnbid", identity.gnbid, result, false), ...toChip("clid", identity.clid, result, true)];
  if (observed.nci === null || observed.nci === undefined) return [];
  return [{ field: NCI_CHIP_FIELD, label: NCI_CHIP_LABEL, value: observed.nci, kind: "same", stored: null }];
}

export function buildIdChips(row: LogRow, result: CellMatchResult | null): IdChipLines {
  const { observed } = row;

  if (observed.rat === "lte") {
    return {
      identity: [...toChip("enbid", observed.enbid, result, false), ...toChip("clid", observed.clid, result, true)],
      values: [
        ...toChip("tac", observed.tac, result, true),
        ...toChip("pci", observed.pci, result, true),
        ...toChip("earfcn", observed.earfcn, result, true),
      ],
    };
  }
  if (observed.rat === "umts") {
    return {
      identity: [...toChip("rnc", observed.rnc, result, false), ...toChip("cid", observed.cid, result, false)],
      values: [...toChip("lac", observed.lac, result, false), ...toChip("uarfcn", observed.uarfcn, result, false)],
    };
  }
  if (observed.rat === "gsm") {
    return { identity: [...toChip("lac", observed.lac, result, false), ...toChip("cid", observed.cid, result, false)], values: [] };
  }
  return {
    identity: buildNrIdentityChips(observed, result),
    values: [
      ...toChip("tac", observed.tac, result, true),
      ...toChip("pci", observed.pci, result, true),
      ...toChip("arfcn", observed.arfcn, result, true),
    ],
  };
}
