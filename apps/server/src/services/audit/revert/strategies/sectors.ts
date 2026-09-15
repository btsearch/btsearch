import { cells, proposedCells, proposedSectors, stationSectors, stations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import { type SectorSnapshot, loadSectorSnapshot } from "../../snapshots.js";
import type { AuditEntry } from "../../types.js";
import { isSnapshotRecord } from "../columns.js";
import { valuesEqual } from "../compare.js";
import { bumpIdentitySequence } from "../sequences.js";
import { type ApplyState, type PlannedEntry, type RevertDependent, type StrategyContext, conflictFor } from "../types.js";
import { asSnapshotArray, createEmptyPlan, inverseMetadata, numberField } from "./common.js";

const SECTOR_UNIQUE_CONSTRAINT = "station_sectors_station_azimuth_unique";

function sectorSnapshots(value: unknown): SectorSnapshot[] | null {
  const rows = asSnapshotArray(value);
  if (rows === null) return null;
  const sectors: SectorSnapshot[] = [];
  for (const row of rows) {
    const id = numberField(row, "id");
    const azimuth = numberField(row, "azimuth");
    if (id === null || azimuth === null) return null;
    sectors.push({ id, azimuth });
  }
  return sectors.sort((left, right) => left.id - right.id);
}

function duplicateValues(values: readonly number[]): number[] {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}

type SectorAssignment = { desired: SectorSnapshot; current: SectorSnapshot };

function matchSectors(
  desired: readonly SectorSnapshot[],
  current: readonly SectorSnapshot[],
): {
  assignments: SectorAssignment[];
  missing: SectorSnapshot[];
  extraIds: number[];
} {
  const currentById = new Map(current.map((sector) => [sector.id, sector]));
  const currentByAzimuth = new Map(current.map((sector) => [sector.azimuth, sector]));
  const assignedByDesiredId = new Map<number, SectorSnapshot>();
  const claimedCurrentIds = new Set<number>();
  for (const sector of desired) {
    const matchingId = currentById.get(sector.id);
    if (matchingId === undefined || claimedCurrentIds.has(matchingId.id)) continue;
    assignedByDesiredId.set(sector.id, matchingId);
    claimedCurrentIds.add(matchingId.id);
  }
  for (const sector of desired) {
    if (assignedByDesiredId.has(sector.id)) continue;
    const matchingAzimuth = currentByAzimuth.get(sector.azimuth);
    if (matchingAzimuth === undefined || claimedCurrentIds.has(matchingAzimuth.id)) continue;
    assignedByDesiredId.set(sector.id, matchingAzimuth);
    claimedCurrentIds.add(matchingAzimuth.id);
  }
  return {
    assignments: desired.flatMap((sector) => {
      const assigned = assignedByDesiredId.get(sector.id);
      return assigned === undefined ? [] : [{ desired: sector, current: assigned }];
    }),
    missing: desired.filter((sector) => !assignedByDesiredId.has(sector.id)),
    extraIds: current.filter((sector) => !claimedCurrentIds.has(sector.id)).map((sector) => sector.id),
  };
}

function freeAzimuth(occupied: ReadonlyMap<number, number>): number | null {
  for (let azimuth = 0; azimuth <= 360; azimuth += 1) if (!occupied.has(azimuth)) return azimuth;
  return null;
}

async function updateSectorAzimuth(tx: DbTx, sectorId: number, azimuth: number): Promise<void> {
  await tx.update(stationSectors).set({ azimuth }).where(eq(stationSectors.id, sectorId));
}

async function restoreAssignedAzimuths(tx: DbTx, assignments: readonly SectorAssignment[]): Promise<void> {
  const positions = new Map(assignments.map(({ current }) => [current.id, current.azimuth]));
  const occupied = new Map(assignments.map(({ current }) => [current.azimuth, current.id]));
  const pending = new Map(
    assignments.filter(({ desired, current }) => desired.azimuth !== current.azimuth).map((assignment) => [assignment.current.id, assignment]),
  );

  /* eslint-disable no-await-in-loop */
  while (pending.size > 0) {
    const movable = [...pending.values()].find(({ desired }) => !occupied.has(desired.azimuth));
    if (movable !== undefined) {
      const previousAzimuth = positions.get(movable.current.id);
      if (previousAzimuth === undefined) throw new Error(`Lost staged sector ${movable.current.id}`);
      await updateSectorAzimuth(tx, movable.current.id, movable.desired.azimuth);
      occupied.delete(previousAzimuth);
      occupied.set(movable.desired.azimuth, movable.current.id);
      positions.set(movable.current.id, movable.desired.azimuth);
      pending.delete(movable.current.id);
      continue;
    }

    const temporaryAzimuth = freeAzimuth(occupied);
    const first = pending.values().next().value as SectorAssignment | undefined;
    if (first === undefined) return;
    const previousAzimuth = positions.get(first.current.id);
    if (previousAzimuth === undefined) throw new Error(`Lost staged sector ${first.current.id}`);
    if (temporaryAzimuth === null) throw new Error("Unable to stage sector azimuths without deleting a retained sector");
    await updateSectorAzimuth(tx, first.current.id, temporaryAzimuth);
    occupied.delete(previousAzimuth);
    occupied.set(temporaryAzimuth, first.current.id);
    positions.set(first.current.id, temporaryAzimuth);
  }
  /* eslint-enable no-await-in-loop */
}

async function insertMissingSectors(
  tx: DbTx,
  state: ApplyState,
  stationId: number,
  sectors: readonly SectorSnapshot[],
  occupiedIds: ReadonlySet<number>,
  reservedThroughId: number,
): Promise<void> {
  if (sectors.length === 0) return;
  const originalIds = sectors.filter((sector) => !occupiedIds.has(sector.id));
  const remappedIds = sectors.filter((sector) => occupiedIds.has(sector.id));
  if (originalIds.length > 0)
    await tx
      .insert(stationSectors)
      .overridingSystemValue()
      .values(originalIds.map((sector) => ({ id: sector.id, station_id: stationId, azimuth: sector.azimuth })));
  for (const sector of originalIds) state.sectorIdRemap.set(sector.id, sector.id);

  if (remappedIds.length > 0) {
    await bumpIdentitySequence(tx, "station_sectors", reservedThroughId);
    /* eslint-disable no-await-in-loop */
    for (const sector of remappedIds) {
      const [inserted] = await tx
        .insert(stationSectors)
        .values({ station_id: stationId, azimuth: sector.azimuth })
        .returning({ id: stationSectors.id });
      if (inserted === undefined) throw new Error(`Failed to restore sector ${sector.id}`);
      state.sectorIdRemap.set(sector.id, inserted.id);
    }
    /* eslint-enable no-await-in-loop */
  }
  state.sequenceTables.add("station_sectors");
}

async function assertRestoredSectorSet(tx: DbTx, state: ApplyState, stationId: number, desired: readonly SectorSnapshot[]): Promise<void> {
  const restored = await loadSectorSnapshot(tx, stationId);
  const mappedIds = desired.map((sector) => state.sectorIdRemap.get(sector.id));
  if (mappedIds.some((id) => id === undefined) || new Set(mappedIds).size !== desired.length || restored.length !== desired.length)
    throw new Error(`Failed to restore the sector set for station ${stationId}`);
  const restoredById = new Map(restored.map((sector) => [sector.id, sector]));
  const incorrectMapping = desired.some((sector) => {
    const restoredId = state.sectorIdRemap.get(sector.id);
    return restoredId === undefined || restoredById.get(restoredId)?.azimuth !== sector.azimuth;
  });
  if (incorrectMapping) throw new Error(`Failed to restore sector mappings for station ${stationId}`);
}

function selectedCellStopsReferencing(context: StrategyContext, cellId: number, sectorId: number): number | undefined {
  const entry = context.selectedEntries.find((candidate) => candidate.entity === "cells" && Number(candidate.record_id) === cellId);
  if (entry === undefined) return undefined;
  if (entry.op === "create") return entry.id;
  if (entry.op !== "update") return undefined;
  const oldValues = entry.old_values;
  const newValues = entry.new_values;
  if (!isSnapshotRecord(oldValues) || !isSnapshotRecord(newValues) || !("sector_id" in oldValues) || !("sector_id" in newValues)) return undefined;
  const oldSectorId = numberField(oldValues, "sector_id");
  const newSectorId = numberField(newValues, "sector_id");
  return oldSectorId !== newSectorId && oldSectorId !== sectorId ? entry.id : undefined;
}

type SectorReferences = {
  dependents: RevertDependent[];
  cellDependencies: Array<{ entryId: number; sectorId: number }>;
};

async function referencedExtras(context: StrategyContext, extraIds: readonly number[]): Promise<SectorReferences> {
  if (extraIds.length === 0) return { dependents: [], cellDependencies: [] };
  const [rows, proposedCellRows, proposedSectorRows] = await Promise.all([
    context.tx
      .select({ id: cells.id, sectorId: cells.sector_id })
      .from(cells)
      .where(inArray(cells.sector_id, [...extraIds])),
    context.tx
      .select({ id: proposedCells.id })
      .from(proposedCells)
      .where(inArray(proposedCells.target_sector_id, [...extraIds])),
    context.tx
      .select({ id: proposedSectors.id })
      .from(proposedSectors)
      .where(inArray(proposedSectors.target_sector_id, [...extraIds])),
  ]);
  const counts = new Map<number, number>();
  const cellDependencies: SectorReferences["cellDependencies"] = [];
  for (const row of rows) {
    if (row.sectorId === null) continue;
    const entryId = selectedCellStopsReferencing(context, row.id, row.sectorId);
    if (entryId !== undefined) {
      cellDependencies.push({ entryId, sectorId: row.sectorId });
      continue;
    }
    counts.set(row.sectorId, (counts.get(row.sectorId) ?? 0) + 1);
  }
  return {
    dependents: [
      ...[...counts].map(([sectorId, value]) => ({ table: `cells(sector_id=${sectorId})`, count: value })),
      { table: "submissions.proposed_cells", count: proposedCellRows.length },
      { table: "submissions.proposed_sectors", count: proposedSectorRows.length },
    ].filter((dependent) => dependent.count > 0),
    cellDependencies,
  };
}

export async function planSectorRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  if (entry.op !== "update" || entry.station_id === null) return plan;
  const stationId = entry.station_id;
  const [station] = await context.tx.select({ id: stations.id }).from(stations).where(eq(stations.id, stationId)).limit(1);
  if (station === undefined) {
    plan.conflicts.push(conflictFor(entry, "fk_missing", "The station no longer exists", "skip"));
    return plan;
  }

  const desired = sectorSnapshots(entry.old_values);
  const expected = sectorSnapshots(entry.new_values);
  if (desired === null || expected === null) return plan;
  const current = await loadSectorSnapshot(context.tx, stationId);
  if (!valuesEqual(expected, current))
    plan.conflicts.push(
      conflictFor(entry, "stale", "The station sectors changed after this operation", "apply", {
        fields: [{ field: "sectors", expected, current }],
      }),
    );

  const duplicateAzimuthValues = duplicateValues(desired.map((sector) => sector.azimuth));
  if (duplicateAzimuthValues.length > 0)
    plan.conflicts.push(
      conflictFor(entry, "unique_violation", "The original sector set contains duplicate azimuths", "skip", {
        constraint: SECTOR_UNIQUE_CONSTRAINT,
        fields: duplicateAzimuthValues.map((azimuth) => ({ field: "azimuth", expected: azimuth, current: azimuth })),
      }),
    );

  const duplicateIdValues = duplicateValues(desired.map((sector) => sector.id));
  if (duplicateIdValues.length > 0)
    plan.conflicts.push(
      conflictFor(entry, "unique_violation", "The original sector set contains duplicate ids", "skip", {
        constraint: "station_sectors_pkey",
        fields: duplicateIdValues.map((id) => ({ field: "id", expected: id, current: id })),
      }),
    );

  const { assignments, missing, extraIds } = matchSectors(desired, current);
  if (assignments.length === 361 && assignments.some(({ desired: target, current: source }) => target.azimuth !== source.azimuth))
    plan.conflicts.push(
      conflictFor(entry, "unique_violation", "All sector azimuths are occupied, so the original set cannot be staged safely", "skip", {
        constraint: SECTOR_UNIQUE_CONSTRAINT,
      }),
    );

  const references = await referencedExtras(context, extraIds);
  for (const dependency of references.cellDependencies)
    plan.dependencies.push({
      prerequisiteEntryId: dependency.entryId,
      failure: {
        kind: "referenced",
        message: "A sector remains assigned to a cell whose revert cannot move it",
        forceResolution: "skip",
        dependents: [{ table: `cells(sector_id=${dependency.sectorId})`, count: 1 }],
      },
    });
  if (references.dependents.length > 0)
    plan.conflicts.push(
      conflictFor(entry, "referenced", "Sectors that must be removed are still referenced", "skip", {
        dependents: references.dependents,
      }),
    );

  const missingIds = missing.map((sector) => sector.id);
  const occupiedRows =
    missingIds.length === 0
      ? []
      : await context.tx.select({ id: stationSectors.id }).from(stationSectors).where(inArray(stationSectors.id, missingIds));
  const occupiedIds = new Set(occupiedRows.map((row) => row.id));
  const reservedThroughId = [...(context.pendingInserts.get("station_sectors")?.keys() ?? [])].reduce((highest, id) => Math.max(highest, id), 1);

  plan.actions.push({
    order: 24,
    run: async (tx, state) => {
      if (extraIds.length > 0) await tx.delete(stationSectors).where(inArray(stationSectors.id, extraIds));
      await restoreAssignedAzimuths(tx, assignments);
      for (const assignment of assignments) state.sectorIdRemap.set(assignment.desired.id, assignment.current.id);
      await insertMissingSectors(tx, state, stationId, missing, occupiedIds, reservedThroughId);
      await assertRestoredSectorSet(tx, state, stationId, desired);
      state.affectedStationIds.add(stationId);
    },
  });
  plan.effects = [{ stationId }];
  plan.finalize = async (tx, audit) => {
    const restored = await loadSectorSnapshot(tx, stationId);
    await audit.log({
      entity: "station_sectors",
      op: "update",
      recordId: null,
      stationId,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}
