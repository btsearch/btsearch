import {
  bands,
  cells,
  locations,
  operators,
  proposedCells,
  proposedLocations,
  proposedStations,
  regions,
  stations,
  statsSnapshots,
  ukeLocations,
  ukePermits,
  ukeStations,
} from "@openbts/drizzle";
import { and, count, eq, isNull, ne } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import type { AuditEntry } from "../../types.js";
import { type SnapshotRecord, isSnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow } from "../columns.js";
import { changedFields, staleFields } from "../compare.js";
import { type ApplyState, type PlannedEntry, type RevertDependent, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, pendingInsertProvider, snapshotFieldNames, stringField } from "./common.js";

function positiveDependents(rows: RevertDependent[]): RevertDependent[] {
  return rows.filter((row) => row.count > 0);
}

function selectedReferenceRemoval(
  context: StrategyContext,
  entity: AuditEntry["entity"],
  recordId: number,
  field: string,
  referencedId: number,
  createDeletes: boolean,
): number | undefined {
  const entry = context.selectedEntries.find((candidate) => candidate.entity === entity && Number(candidate.record_id) === recordId);
  if (entry === undefined) return undefined;
  if (entry.op === "create") return createDeletes ? entry.id : undefined;
  if (
    entry.op !== "update" ||
    !isSnapshotRecord(entry.old_values) ||
    !isSnapshotRecord(entry.new_values) ||
    !(field in entry.old_values) ||
    !(field in entry.new_values)
  )
    return undefined;
  const oldId = numberField(entry.old_values, field);
  const newId = numberField(entry.new_values, field);
  return oldId !== newId && oldId !== referencedId ? entry.id : undefined;
}

function addReferenceRemovalDependency(plan: PlannedEntry, prerequisiteEntryId: number, table: string, message: string): void {
  plan.dependencies.push({
    prerequisiteEntryId,
    failure: {
      kind: "referenced",
      message,
      forceResolution: "skip",
      dependents: [{ table, count: 1 }],
    },
  });
}

async function markOperatorStations(tx: DbTx, state: ApplyState, operatorId: number): Promise<void> {
  const rows = await tx.select({ id: stations.id }).from(stations).where(eq(stations.operator_id, operatorId));
  for (const row of rows) state.affectedStationIds.add(row.id);
}

async function markBandStations(tx: DbTx, state: ApplyState, bandId: number): Promise<void> {
  const rows = await tx.selectDistinct({ stationId: cells.station_id }).from(cells).where(eq(cells.band_id, bandId));
  for (const row of rows) state.affectedStationIds.add(row.stationId);
}

async function markRegionStations(tx: DbTx, state: ApplyState, regionId: number): Promise<void> {
  const rows = await tx
    .selectDistinct({ stationId: stations.id })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(eq(locations.region_id, regionId));
  for (const row of rows) state.affectedStationIds.add(row.stationId);
}

async function operatorDependents(context: StrategyContext, plan: PlannedEntry, id: number): Promise<RevertDependent[]> {
  const [stationRows, ukeRows, childRows, proposedRows, snapshotRows] = await Promise.all([
    context.tx.select({ id: stations.id }).from(stations).where(eq(stations.operator_id, id)),
    context.tx.select({ value: count() }).from(ukeStations).where(eq(ukeStations.operator_id, id)),
    context.tx.select({ id: operators.id }).from(operators).where(eq(operators.parent_id, id)),
    context.tx.select({ value: count() }).from(proposedStations).where(eq(proposedStations.operator_id, id)),
    context.tx.select({ value: count() }).from(statsSnapshots).where(eq(statsSnapshots.operator_id, id)),
  ]);
  const stationaryStations = stationRows.filter((station) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "stations", station.id, "operator_id", id, false);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "stations", "The operator remains assigned to a station whose revert cannot move it");
    return false;
  });
  const retainedChildren = childRows.filter((child) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "operators", child.id, "parent_id", id, true);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "operators", "The operator remains a parent of an operator whose revert cannot move it");
    return false;
  });
  return positiveDependents([
    { table: "stations", count: stationaryStations.length },
    { table: "uke.uke_stations", count: ukeRows[0]?.value ?? 0 },
    { table: "operators", count: retainedChildren.length },
    { table: "submissions.proposed_stations", count: proposedRows[0]?.value ?? 0 },
    { table: "statistics.stats_snapshots", count: snapshotRows[0]?.value ?? 0 },
  ]);
}

async function bandDependents(context: StrategyContext, plan: PlannedEntry, id: number): Promise<RevertDependent[]> {
  const [cellRows, permitRows, proposedRows, snapshotRows] = await Promise.all([
    context.tx.select({ id: cells.id }).from(cells).where(eq(cells.band_id, id)),
    context.tx.select({ value: count() }).from(ukePermits).where(eq(ukePermits.band_id, id)),
    context.tx.select({ value: count() }).from(proposedCells).where(eq(proposedCells.band_id, id)),
    context.tx.select({ value: count() }).from(statsSnapshots).where(eq(statsSnapshots.band_id, id)),
  ]);
  const retainedCells = cellRows.filter((cell) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "cells", cell.id, "band_id", id, true);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "cells", "The band remains assigned to a cell whose revert cannot move it");
    return false;
  });
  return positiveDependents([
    { table: "cells", count: retainedCells.length },
    { table: "uke.uke_permits", count: permitRows[0]?.value ?? 0 },
    { table: "submissions.proposed_cells", count: proposedRows[0]?.value ?? 0 },
    { table: "statistics.stats_snapshots", count: snapshotRows[0]?.value ?? 0 },
  ]);
}

async function regionDependents(context: StrategyContext, plan: PlannedEntry, id: number): Promise<RevertDependent[]> {
  const [locationRows, ukeRows, proposedRows] = await Promise.all([
    context.tx.select({ id: locations.id }).from(locations).where(eq(locations.region_id, id)),
    context.tx.select({ value: count() }).from(ukeLocations).where(eq(ukeLocations.region_id, id)),
    context.tx.select({ value: count() }).from(proposedLocations).where(eq(proposedLocations.region_id, id)),
  ]);
  const retainedLocations = locationRows.filter((location) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "locations", location.id, "region_id", id, true);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "locations", "The region remains assigned to a location whose revert cannot move it");
    return false;
  });
  return positiveDependents([
    { table: "locations", count: retainedLocations.length },
    { table: "uke.uke_locations", count: ukeRows[0]?.value ?? 0 },
    { table: "submissions.proposed_locations", count: proposedRows[0]?.value ?? 0 },
  ]);
}

async function addOperatorUniqueConflicts(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const name = stringField(target, "name");
  if (name !== null) {
    const [duplicate] = await context.tx
      .select({ id: operators.id })
      .from(operators)
      .where(and(eq(operators.name, name), ne(operators.id, id)))
      .limit(1);
    if (duplicate !== undefined)
      plan.conflicts.push(
        conflictFor(plan.entry, "unique_violation", "The original operator name is already in use", "skip", { constraint: "operators_name_unique" }),
      );
  }
  const mnc = numberField(target, "mnc");
  if (mnc !== null) {
    const [duplicate] = await context.tx
      .select({ id: operators.id })
      .from(operators)
      .where(and(eq(operators.mnc, mnc), ne(operators.id, id)))
      .limit(1);
    if (duplicate !== undefined)
      plan.conflicts.push(
        conflictFor(plan.entry, "unique_violation", "The original operator MNC is already in use", "skip", { constraint: "operators_mnc_unique" }),
      );
  }
}

async function addOperatorParentConflict(
  context: StrategyContext,
  plan: PlannedEntry,
  target: SnapshotRecord,
  fields: ReadonlySet<string>,
): Promise<number | undefined> {
  if (!fields.has("parent_id")) return undefined;
  const parentId = numberField(target, "parent_id");
  if (parentId === null) return undefined;
  const prerequisiteEntryId = pendingInsertProvider(context, "operators", parentId);
  if (prerequisiteEntryId !== undefined) {
    plan.dependencies.push({
      prerequisiteEntryId,
      failure: {
        kind: "fk_missing",
        message: "The original parent operator cannot be restored",
        forceResolution: "drop_field",
        nullableField: "parent_id",
        constraint: "operators_parent_id_operators_id_fk",
      },
    });
    return prerequisiteEntryId;
  }
  const [parent] = await context.tx.select({ id: operators.id }).from(operators).where(eq(operators.id, parentId)).limit(1);
  if (parent !== undefined) return undefined;
  plan.conflicts.push(
    conflictFor(plan.entry, "fk_missing", "The original parent operator no longer exists", "drop_field", {
      constraint: "operators_parent_id_operators_id_fk",
      nullableField: "parent_id",
    }),
  );
  return undefined;
}

async function addBandUniqueConflicts(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  type BandRow = typeof bands.$inferSelect;
  const name = stringField(target, "name");
  if (name !== null) {
    const [duplicate] = await context.tx
      .select({ id: bands.id })
      .from(bands)
      .where(and(eq(bands.name, name), ne(bands.id, id)))
      .limit(1);
    if (duplicate !== undefined)
      plan.conflicts.push(
        conflictFor(plan.entry, "unique_violation", "The original band name is already in use", "skip", { constraint: "bands_name_unique" }),
      );
  }

  const rat = stringField(target, "rat");
  if (rat === null) return;
  const value = numberField(target, "value");
  const duplex = stringField(target, "duplex");
  const variant = stringField(target, "variant");
  if (variant === null) return;
  const [duplicate] = await context.tx
    .select({ id: bands.id })
    .from(bands)
    .where(
      and(
        eq(bands.rat, rat as BandRow["rat"]),
        value === null ? isNull(bands.value) : eq(bands.value, value),
        duplex === null ? isNull(bands.duplex) : eq(bands.duplex, duplex as NonNullable<BandRow["duplex"]>),
        eq(bands.variant, variant as BandRow["variant"]),
        ne(bands.id, id),
      ),
    )
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The original band definition is already in use", "skip", {
        constraint: "bands_rat_value_unique",
      }),
    );
}

async function addRegionUniqueConflicts(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const checks = [
    ["name", regions.name, "regions_name_unique"],
    ["code", regions.code, "regions_code_unique"],
  ] as const;
  const duplicates = await Promise.all(
    checks.map(async ([field, column]) => {
      const value = stringField(target, field);
      if (value === null) return false;
      const [duplicate] = await context.tx
        .select({ id: regions.id })
        .from(regions)
        .where(and(eq(column, value), ne(regions.id, id)))
        .limit(1);
      return duplicate !== undefined;
    }),
  );
  for (const [index, [field, _column, constraint]] of checks.entries()) {
    if (!duplicates[index]) continue;
    plan.conflicts.push(conflictFor(plan.entry, "unique_violation", `The original region ${field} is already in use`, "skip", { constraint }));
  }
}

async function planOperatorRevert(context: StrategyContext, entry: AuditEntry, id: number): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const [current] = await context.tx.select().from(operators).where(eq(operators.id, id)).limit(1);
  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The operator is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new operator");
    const fields = snapshotFieldNames(expected);
    const differences = staleFields(operators, expected, current, fields);
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The operator changed after this operation", "apply", { fields: differences }));
    const dependents = await operatorDependents(context, plan, id);
    if (dependents.length > 0) plan.conflicts.push(conflictFor(entry, "referenced", "The operator is still referenced", "skip", { dependents }));
    plan.actions.push({
      order: 52,
      run: async (tx, state) => {
        await markOperatorStations(tx, state, id);
        await tx.delete(operators).where(eq(operators.id, id));
      },
    });
    plan.finalize = async (_tx, audit) =>
      audit.log({
        entity: "operators",
        op: "delete",
        recordId: id,
        old: current,
        new: null,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    return plan;
  }
  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "An operator with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old operator");
    const [, parentProvider] = await Promise.all([
      addOperatorUniqueConflicts(context, plan, id, oldValues),
      addOperatorParentConflict(context, plan, oldValues, new Set(["parent_id"])),
    ]);
    const parentId = numberField(oldValues, "parent_id");
    plan.actions.push({
      order: 21,
      run: async (tx, state) => {
        const row = snapshotToRow(operators, oldValues, { includeIdentity: true });
        const deferredParent = parentProvider !== undefined;
        await tx
          .insert(operators)
          .overridingSystemValue()
          .values({
            ...row,
            id,
            parent_id: plan.droppedFields.has("parent_id") || deferredParent ? null : parentId,
          } as typeof operators.$inferInsert);
        state.sequenceTables.add("operators");
      },
    });
    if (parentId !== null && parentProvider !== undefined)
      plan.actions.push({
        order: 30,
        run: async (tx) => {
          if (plan.droppedFields.has("parent_id")) return;
          await tx.update(operators).set({ parent_id: parentId }).where(eq(operators.id, id));
        },
      });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(operators).where(eq(operators.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored operator ${id} disappeared`);
      await audit.log({
        entity: "operators",
        op: "create",
        recordId: id,
        old: null,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The operator no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old operator");
  const newValues = requireSnapshot(entry.new_values, "new operator");
  const fields = changedFields(operators, oldValues, newValues);
  const differences = staleFields(operators, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The operator changed after this operation", "apply", { fields: differences }));
  await Promise.all([addOperatorUniqueConflicts(context, plan, id, oldValues), addOperatorParentConflict(context, plan, oldValues, new Set(fields))]);
  plan.actions.push({
    order: 30,
    run: async (tx, state) => {
      await markOperatorStations(tx, state, id);
      const patch = snapshotToRow(operators, oldValues, { fields });
      if (plan.droppedFields.has("parent_id")) patch.parent_id = null;
      await tx.update(operators).set(patch).where(eq(operators.id, id));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(operators).where(eq(operators.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated operator ${id} disappeared`);
    await audit.log({
      entity: "operators",
      op: "update",
      recordId: id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}

async function planBandRevert(context: StrategyContext, entry: AuditEntry, id: number): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const [current] = await context.tx.select().from(bands).where(eq(bands.id, id)).limit(1);
  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The band is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new band");
    const differences = staleFields(bands, expected, current, snapshotFieldNames(expected));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The band changed after this operation", "apply", { fields: differences }));
    const dependents = await bandDependents(context, plan, id);
    if (dependents.length > 0) plan.conflicts.push(conflictFor(entry, "referenced", "The band is still referenced", "skip", { dependents }));
    plan.actions.push({
      order: 51,
      run: async (tx, state) => {
        await markBandStations(tx, state, id);
        await tx.delete(bands).where(eq(bands.id, id));
      },
    });
    plan.finalize = async (_tx, audit) =>
      audit.log({ entity: "bands", op: "delete", recordId: id, old: current, new: null, metadata: inverseMetadata(entry.id, plan.droppedFields) });
    return plan;
  }
  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "A band with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old band");
    await addBandUniqueConflicts(context, plan, id, oldValues);
    plan.actions.push({
      order: 22,
      run: async (tx, state) => {
        const row = snapshotToRow(bands, oldValues, { includeIdentity: true });
        await tx
          .insert(bands)
          .overridingSystemValue()
          .values({ ...row, id } as typeof bands.$inferInsert);
        state.sequenceTables.add("bands");
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(bands).where(eq(bands.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored band ${id} disappeared`);
      await audit.log({
        entity: "bands",
        op: "create",
        recordId: id,
        old: null,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The band no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old band");
  const newValues = requireSnapshot(entry.new_values, "new band");
  const fields = changedFields(bands, oldValues, newValues);
  const differences = staleFields(bands, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The band changed after this operation", "apply", { fields: differences }));
  await addBandUniqueConflicts(context, plan, id, oldValues);
  plan.actions.push({
    order: 30,
    run: async (tx, state) => {
      await markBandStations(tx, state, id);
      await tx
        .update(bands)
        .set(snapshotToRow(bands, oldValues, { fields }))
        .where(eq(bands.id, id));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(bands).where(eq(bands.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated band ${id} disappeared`);
    await audit.log({
      entity: "bands",
      op: "update",
      recordId: id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}

async function planRegionRevert(context: StrategyContext, entry: AuditEntry, id: number): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const [current] = await context.tx.select().from(regions).where(eq(regions.id, id)).limit(1);
  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The region is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new region");
    const differences = staleFields(regions, expected, current, snapshotFieldNames(expected));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The region changed after this operation", "apply", { fields: differences }));
    const dependents = await regionDependents(context, plan, id);
    if (dependents.length > 0) plan.conflicts.push(conflictFor(entry, "referenced", "The region is still referenced", "skip", { dependents }));
    plan.actions.push({
      order: 53,
      run: async (tx, state) => {
        await markRegionStations(tx, state, id);
        await tx.delete(regions).where(eq(regions.id, id));
      },
    });
    plan.finalize = async (_tx, audit) =>
      audit.log({ entity: "regions", op: "delete", recordId: id, old: current, new: null, metadata: inverseMetadata(entry.id, plan.droppedFields) });
    return plan;
  }
  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "A region with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old region");
    await addRegionUniqueConflicts(context, plan, id, oldValues);
    plan.actions.push({
      order: 20,
      run: async (tx, state) => {
        const row = snapshotToRow(regions, oldValues, { includeIdentity: true });
        await tx
          .insert(regions)
          .overridingSystemValue()
          .values({ ...row, id } as typeof regions.$inferInsert);
        state.sequenceTables.add("regions");
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(regions).where(eq(regions.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored region ${id} disappeared`);
      await audit.log({
        entity: "regions",
        op: "create",
        recordId: id,
        old: null,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The region no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old region");
  const newValues = requireSnapshot(entry.new_values, "new region");
  const fields = changedFields(regions, oldValues, newValues);
  const differences = staleFields(regions, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The region changed after this operation", "apply", { fields: differences }));
  await addRegionUniqueConflicts(context, plan, id, oldValues);
  plan.actions.push({
    order: 30,
    run: async (tx, state) => {
      await markRegionStations(tx, state, id);
      await tx
        .update(regions)
        .set(snapshotToRow(regions, oldValues, { fields }))
        .where(eq(regions.id, id));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(regions).where(eq(regions.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated region ${id} disappeared`);
    await audit.log({
      entity: "regions",
      op: "update",
      recordId: id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}

export async function planReferenceRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const id = recordIdNumber(entry.record_id);
  if (id === null) return createEmptyPlan(entry);
  switch (entry.entity) {
    case "operators":
      return planOperatorRevert(context, entry, id);
    case "bands":
      return planBandRevert(context, entry, id);
    case "regions":
      return planRegionRevert(context, entry, id);
    default:
      return createEmptyPlan(entry);
  }
}
