import type { AuditEntity } from "@openbts/shared/audit";

import type { DbTx } from "../../../types/global.js";
import type { AuditContext } from "../context.js";
import type { AuditEntry, AuditOperationSummary, AuditRecorder } from "../types.js";

export type RevertConflictKind =
  | "missing"
  | "stale"
  | "already_absent"
  | "exists"
  | "unique_violation"
  | "fk_missing"
  | "referenced"
  | "station_without_cells"
  | "concurrent_modification";

export type RevertConflictField = {
  field: string;
  expected: unknown;
  current: unknown;
};

export type RevertDependent = {
  table: string;
  count: number;
};

export type RevertConflict = {
  entry_id: number;
  entity: AuditEntity;
  op: AuditEntry["op"];
  record_id: string | null;
  station_id: number | null;
  kind: RevertConflictKind;
  message: string;
  fields?: RevertConflictField[];
  dependents?: RevertDependent[];
  constraint?: string;
};

export type RevertSkipped = {
  entry_id: number;
  reason: string;
  message?: string;
};

export type RevertSkippedField = {
  entry_id: number;
  field: string;
  reason: "fk_missing";
};

export type RevertOperationResult = {
  operation: AuditOperationSummary;
  reverted: number[];
  skipped: RevertSkipped[];
  skipped_fields: RevertSkippedField[];
  affected_station_ids: number[];
};

export type RevertOperationInput = {
  operationId: number;
  entryIds?: readonly number[];
  force: boolean;
  ctx: AuditContext;
};

export type SequenceTable = "cells" | "locations" | "station_sectors" | "extra_identificators" | "operators" | "bands" | "regions";

type CellChangeKind = "added" | "removed" | "updated";

export type ApplyState = {
  affectedStationIds: Set<number>;
  cellChanges: Map<number, Record<CellChangeKind, number>>;
  sequenceTables: Set<SequenceTable>;
  sectorIdRemap: Map<number, number>;
  touchedLocationIds: Set<number>;
  stationOrLocationWritten: boolean;
};

type ForceResolution = "apply" | "skip" | "drop_field";

export type PlannedConflict = RevertConflict & {
  forceResolution: ForceResolution;
  nullableField?: string;
};

type PlanEffect = {
  stationId: number;
  cellDelta?: number;
  finalStatus?: "published" | "pending" | "inactive";
};

type PlannedAction = {
  order: number;
  run: (tx: DbTx, state: ApplyState) => Promise<void>;
};

export type PlannedEntry = {
  entry: AuditEntry;
  actions: PlannedAction[];
  conflicts: PlannedConflict[];
  dependencies: PlanDependency[];
  droppedFields: Set<string>;
  effects: PlanEffect[];
  skip?: RevertSkipped;
  finalize: (tx: DbTx, audit: AuditRecorder, state: ApplyState) => Promise<void>;
};

type PlanDependencyFailure =
  | {
      kind: RevertConflictKind;
      message: string;
      forceResolution: "skip";
      constraint?: string;
      dependents?: RevertDependent[];
    }
  | {
      kind: "fk_missing";
      message: string;
      forceResolution: "drop_field";
      nullableField: string;
      constraint?: string;
    };

export type PlanDependency = {
  prerequisiteEntryId: number;
  prerequisiteField?: string;
  failure: PlanDependencyFailure;
};

export type PendingInserts = ReadonlyMap<AuditEntity, ReadonlyMap<number, number>>;

export type StrategyContext = {
  tx: DbTx;
  pendingInserts: PendingInserts;
  selectedEntries: readonly AuditEntry[];
};

export type RevertStrategy = (context: StrategyContext, entry: AuditEntry) => Promise<PlannedEntry>;

type PlannedConflictExtras = Partial<Pick<PlannedConflict, "fields" | "dependents" | "constraint" | "nullableField">>;

export function emptyApplyState(): ApplyState {
  return {
    affectedStationIds: new Set(),
    cellChanges: new Map(),
    sequenceTables: new Set(),
    sectorIdRemap: new Map(),
    touchedLocationIds: new Set(),
    stationOrLocationWritten: false,
  };
}

export function addCellChange(state: ApplyState, stationId: number, kind: CellChangeKind): void {
  const counts = state.cellChanges.get(stationId) ?? { added: 0, removed: 0, updated: 0 };
  counts[kind] += 1;
  state.cellChanges.set(stationId, counts);
  state.affectedStationIds.add(stationId);
}

export function conflictFor(
  entry: AuditEntry,
  kind: RevertConflictKind,
  message: string,
  forceResolution: ForceResolution,
  extras: PlannedConflictExtras = {},
): PlannedConflict {
  return {
    entry_id: entry.id,
    entity: entry.entity,
    op: entry.op,
    record_id: entry.record_id,
    station_id: entry.station_id,
    kind,
    message,
    forceResolution,
    ...extras,
  };
}
