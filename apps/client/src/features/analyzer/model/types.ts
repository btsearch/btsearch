import type {
  Band,
  Cell,
  CellDifferenceField,
  CellMatchResult,
  CellRat,
  ObservedCell,
  OfficialSiteRef,
  Region,
  Station,
} from "@openbts/shared/contract";

import type { MapOperator, MapOperatorGroup } from "@/features/map/data/mapLookups";
import type { FileFormat } from "@/lib/analyzer/analyzerParsers";

export type LogFormat = FileFormat;

export type LogRow = {
  index: number;
  observed: ObservedCell;
  description: string;
};

export type AnalyzerFile = {
  name: string;
  sizeBytes: number;
  format: LogFormat;
  rowCount: number;
  skippedCount: number;
  hasOneDescription: boolean;
};

export type MatchTables = {
  stationsById: ReadonlyMap<number, Station>;
  cellsById: ReadonlyMap<number, Cell>;
  officialSitesById: ReadonlyMap<number, OfficialSiteRef>;
};

export type MatchResults = readonly (CellMatchResult | null)[];
export type MatchFailure = "network" | "rateLimited" | "refused";
export type AnalysisState =
  | { phase: "idle" }
  | { phase: "running"; doneChunks: number; chunkCount: number; startedAt: number }
  | { phase: "failed"; missingChunks: readonly number[]; chunkCount: number; cause: MatchFailure; analyzedRowCount: number }
  | { phase: "done"; finishedAt: number; durationMs: number };

export type RowStatus = "pending" | "found" | "probable" | "notFound";

export type DifferenceField = CellDifferenceField;
export type DifferenceKind =
  | DifferenceField
  | `no-${DifferenceField}`
  | "new"
  | "by-lac"
  | "shared"
  | "unknown-cell"
  | "unknown-operator"
  | "no-identifiers";
export type DifferenceFilter = "any" | DifferenceKind;

export type TickAction = "update" | "create" | "confirm";
export type TickBlock = "pending" | "noDifferences" | "shared" | "cellUnknown" | "operatorUnknown" | "noIdentifiers";
export type TickState = { canTick: true; action: TickAction } | { canTick: false; reason: TickBlock };

export type RowFacts = {
  operatorId: number | null;
  countryCode: string | null;
  rat: CellRat;
  bandId: number | null;
  bandKey: string;
  status: RowStatus;
  kinds: readonly DifferenceKind[];
  tick: TickState;
  stationId: number | null;
  isUnconfirmed: boolean;
};

export type ChipKind = "same" | "changed" | "added";
export type IdChip = { field: string; label: string; value: number; kind: ChipKind; stored: number | null };
export type IdChipLines = { identity: IdChip[]; values: IdChip[] };

export type AnalyzerViewer = { userId: string; isStaff: boolean; stationCap: number };

export type AnalyzerLookups = {
  operatorsById: ReadonlyMap<number, MapOperator>;
  operatorGroups: ReadonlyMap<string, MapOperatorGroup>;
  operatorIdByPlmn: ReadonlyMap<string, number>;
  bands: readonly Band[];
  bandsById: ReadonlyMap<number, Band>;
  regionsById: ReadonlyMap<number, Region>;
  planBandIdsByCountry: ReadonlyMap<string, ReadonlySet<number>>;
};
