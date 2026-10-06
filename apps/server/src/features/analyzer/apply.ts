import { cells, lteCells } from "@openbts/drizzle";
import type { CellApply } from "@openbts/shared/contract";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { itemRefusal, pointRefusalsAtItem } from "../../lib/itemRefusals.js";
import { hasStaffPermission } from "../access/staff.js";
import { type AuditRecorder, type CellSnapshot, loadCellSnapshots, runAuditedOperation, standaloneAuditContext } from "../audit/index.js";
import { type CellIdentityDuplicateDetails, getCellIdentityDuplicateKey } from "../cells/identityDuplicateSpecs.js";
import { prepareStationChange } from "../stations/edit.js";
import { findVisibleStation } from "../stations/read.js";
import { type AppliedChange, applyDirectChange, finishDirectChange } from "../submissions/actions.js";
import type { ChangeCell, SubmissionChange } from "../submissions/create.js";
import type { StationEdit } from "../submissions/translate.js";

type StoredTacs = ReadonlyMap<number, number | null>;
type StationChange = { stationId: number; operatorId: number | null; change: SubmissionChange; tac?: number };
type AppliedStation = { stationId: number; applied: AppliedChange };
type AppliedOperation = { operationId: number; appliedStations: AppliedStation[] };
type SpreadCell = { id: number; old: CellSnapshot };
type WrittenCells = { stationId: number; cellIds: number[] };
type WrittenOperation = { operationId: number; stations: WrittenCells[] };

function toConfirmedEdit(item: CellApply): StationEdit {
  return { action: "update", stationId: item.stationId, cells: item.cells.map((cell) => ({ ...cell, isConfirmed: true })) };
}

async function prepareItem(req: FastifyRequest, item: CellApply, index: number): Promise<StationChange> {
  const station = await findVisibleStation(req, item.stationId);
  const change = await prepareStationChange(req, toConfirmedEdit(item), (path) => [index, ...path]);
  return { stationId: item.stationId, operatorId: station.operator_id, change };
}

function assertIdentitiesAppearOnce(stationChanges: readonly StationChange[]): void {
  const seen = new Set<string>();
  for (const [index, { operatorId, change }] of stationChanges.entries()) {
    for (const [cellIndex, cell] of (change.cells ?? []).entries()) {
      const identity = getCellIdentityDuplicateKey({ rat: cell.rat, details: cell.details as CellIdentityDuplicateDetails | undefined });
      if (operatorId === null || !identity) continue;

      const key = `${operatorId}:${identity.rat}:${identity.key}`;
      if (seen.has(key)) throw itemRefusal("BAD_REQUEST", identity.message, [index, "cells", cellIndex]);
      seen.add(key);
    }
  }
}

async function loadStoredTacs(stationChanges: readonly StationChange[]): Promise<StoredTacs> {
  const lteCellChanges = stationChanges.flatMap(({ change }) => change.cells ?? []).filter((cell) => cell.rat === "LTE");
  const cellIds = lteCellChanges.flatMap((cell) => cell.target_cell_id ?? []);
  if (cellIds.length === 0) return new Map();

  const rows = await db.select({ cellId: lteCells.cell_id, tac: lteCells.tac }).from(lteCells).where(inArray(lteCells.cell_id, cellIds));
  return new Map(rows.map((row) => [row.cellId, row.tac]));
}

function changedTac(cell: ChangeCell, storedTacs: StoredTacs): number | undefined {
  if (cell.rat !== "LTE") return undefined;

  const tac = (cell.details as { tac?: number | null } | undefined)?.tac;
  if (typeof tac !== "number") return undefined;

  const storedTac = typeof cell.target_cell_id === "number" ? storedTacs.get(cell.target_cell_id) : undefined;
  return storedTac === tac ? undefined : tac;
}

function withStationTac(stationChange: StationChange, storedTacs: StoredTacs, index: number): StationChange {
  const { stationId, change } = stationChange;
  const tacs = unique((change.cells ?? []).map((cell) => changedTac(cell, storedTacs)));
  if (tacs.length > 1) throw itemRefusal("BAD_REQUEST", `Multiple TAC values submitted for station ${stationId}`, [index]);

  const [tac] = tacs;
  if (tac === undefined) return stationChange;

  const cellsWithTac = change.cells?.map((cell) => (cell.rat === "LTE" ? { ...cell, details: { ...(cell.details as object), tac } } : cell));
  return { ...stationChange, change: { ...change, cells: cellsWithTac }, tac };
}

async function spreadTac(audit: AuditRecorder, stationId: number, tac: number): Promise<SpreadCell[]> {
  const { tx } = audit;
  const rows = await tx
    .select({ cellId: lteCells.cell_id })
    .from(lteCells)
    .innerJoin(cells, eq(cells.id, lteCells.cell_id))
    .where(and(eq(cells.station_id, stationId), eq(cells.rat, "LTE"), sql`${lteCells.tac} IS DISTINCT FROM ${tac}`))
    .orderBy(asc(cells.id));
  const cellIds = rows.map((row) => row.cellId);
  if (cellIds.length === 0) return [];

  const previousSnapshots = await loadCellSnapshots(tx, cellIds);
  const now = new Date();
  await tx.update(lteCells).set({ tac, updatedAt: now }).where(inArray(lteCells.cell_id, cellIds));
  await tx.update(cells).set({ updatedAt: now }).where(inArray(cells.id, cellIds));
  const nextSnapshots = await loadCellSnapshots(tx, cellIds);

  const spreadCells = cellIds.map((cellId) => {
    const old = previousSnapshots.get(cellId);
    const snapshot = nextSnapshots.get(cellId);
    if (!old || !snapshot) throw new ErrorResponse("FAILED_TO_UPDATE");
    return { id: cellId, old, snapshot };
  });
  await audit.logMany(
    spreadCells.map(({ id, old, snapshot }) => ({
      entity: "cells" as const,
      op: "update" as const,
      recordId: id,
      stationId,
      old,
      new: snapshot,
      metadata: audit.entryMetadata,
    })),
  );
  return spreadCells.map(({ id, old }) => ({ id, old }));
}

async function applyStationCells(audit: AuditRecorder, { stationId, change, tac }: StationChange): Promise<AppliedChange> {
  const applied = await applyDirectChange(audit, change);
  if (tac === undefined) return applied;

  const spreadCells = await spreadTac(audit, stationId, tac);
  return { ...applied, cellChanges: { ...applied.cellChanges, updated: [...applied.cellChanges.updated, ...spreadCells] } };
}

async function applyStationChanges(audit: AuditRecorder, stationChanges: readonly StationChange[]): Promise<AppliedOperation> {
  const analyzerAudit = audit.withEntryMetadata({ source: "analyzer" });
  const appliedStations: AppliedStation[] = [];
  for (const [index, stationChange] of stationChanges.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const applied = await pointRefusalsAtItem(index, () => applyStationCells(analyzerAudit, stationChange));
    appliedStations.push({ stationId: stationChange.stationId, applied });
  }
  return { operationId: audit.operationId, appliedStations };
}

export async function applyCells(req: FastifyRequest, items: readonly CellApply[]): Promise<WrittenOperation> {
  if (!(await hasStaffPermission(req, { cells: ["create", "update"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const prepared = await Promise.all(items.map((item, index) => pointRefusalsAtItem(index, () => prepareItem(req, item, index))));
  assertIdentitiesAppearOnce(prepared);
  const storedTacs = await loadStoredTacs(prepared);
  const stationChanges = prepared.map((stationChange, index) => withStationTac(stationChange, storedTacs, index));

  const { operationId, appliedStations } = await runAuditedOperation(
    standaloneAuditContext(req),
    { kind: "analyzer.apply", metadata: { station_ids: stationChanges.map(({ stationId }) => stationId) } },
    (_tx, audit) => applyStationChanges(audit, stationChanges),
  );

  await Promise.all(appliedStations.map(({ applied }) => finishDirectChange("update", applied)));
  return {
    operationId,
    stations: appliedStations.map(({ stationId, applied: { cellChanges } }) => ({
      stationId,
      cellIds: [...cellChanges.added, ...cellChanges.updated.map(({ id }) => id)],
    })),
  };
}
