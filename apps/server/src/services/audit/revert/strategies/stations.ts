import { stations } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";

import { type StationStatus, stationStatusUpdate } from "../../../stations/status.js";
import type { AuditEntry } from "../../types.js";
import { type SnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow } from "../columns.js";
import { changedFields, staleFields } from "../compare.js";
import { type PlannedEntry, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, pendingInsertProvider, snapshotFieldNames, stringField } from "./common.js";

const STATION_UNIQUE_CONSTRAINT = "stations_station_id_operator_unique";

function stationStatus(record: SnapshotRecord): StationStatus | null {
  const status = stringField(record, "status");
  return status === "published" || status === "pending" || status === "inactive" ? status : null;
}

async function addForeignKeyConflicts(
  context: StrategyContext,
  plan: PlannedEntry,
  target: SnapshotRecord,
  fields: ReadonlySet<string>,
): Promise<void> {
  const locationId = numberField(target, "location_id");
  if (fields.has("location_id") && locationId !== null) {
    const prerequisiteEntryId = pendingInsertProvider(context, "locations", locationId);
    if (prerequisiteEntryId !== undefined)
      plan.dependencies.push({
        prerequisiteEntryId,
        failure: {
          kind: "fk_missing",
          message: "The original location cannot be restored",
          forceResolution: "drop_field",
          nullableField: "location_id",
          constraint: "stations_location_id_locations_id_fk",
        },
      });
    else {
      const location = await context.tx.query.locations.findFirst({ where: { id: locationId }, columns: { id: true } });
      if (location === undefined)
        plan.conflicts.push(
          conflictFor(plan.entry, "fk_missing", "The original location no longer exists", "drop_field", {
            constraint: "stations_location_id_locations_id_fk",
            nullableField: "location_id",
          }),
        );
    }
  }

  const operatorId = numberField(target, "operator_id");
  if (fields.has("operator_id") && operatorId !== null) {
    const prerequisiteEntryId = pendingInsertProvider(context, "operators", operatorId);
    if (prerequisiteEntryId !== undefined)
      plan.dependencies.push({
        prerequisiteEntryId,
        failure: {
          kind: "fk_missing",
          message: "The original operator cannot be restored",
          forceResolution: "drop_field",
          nullableField: "operator_id",
          constraint: "stations_operator_id_operators_id_fk",
        },
      });
    else {
      const operator = await context.tx.query.operators.findFirst({ where: { id: operatorId }, columns: { id: true } });
      if (operator === undefined)
        plan.conflicts.push(
          conflictFor(plan.entry, "fk_missing", "The original operator no longer exists", "drop_field", {
            constraint: "stations_operator_id_operators_id_fk",
            nullableField: "operator_id",
          }),
        );
    }
  }
}

async function addUniqueConflict(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const stationId = stringField(target, "station_id");
  const operatorId = numberField(target, "operator_id");
  if (stationId === null || operatorId === null) return;
  const [duplicate] = await context.tx
    .select({ id: stations.id })
    .from(stations)
    .where(and(eq(stations.station_id, stationId), eq(stations.operator_id, operatorId), ne(stations.id, id)))
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The original station identity is already in use", "skip", {
        constraint: STATION_UNIQUE_CONSTRAINT,
      }),
    );
}

export async function planStationRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const id = recordIdNumber(entry.record_id);
  if (id === null) return plan;
  const [current] = await context.tx.select().from(stations).where(eq(stations.id, id)).limit(1);

  if (entry.op === "create") {
    if (current === undefined) {
      plan.conflicts.push(conflictFor(entry, "missing", "The station no longer exists", "skip"));
      return plan;
    }
    if (current.status === "inactive") {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The station is already inactive" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new station");
    const differences = staleFields(stations, expected, current, snapshotFieldNames(expected, ["statusChangedAt"]));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The station changed after this operation", "apply", { fields: differences }));

    plan.effects = [{ stationId: id, finalStatus: "inactive" }];
    plan.actions.push({
      order: 40,
      run: async (tx, state) => {
        await tx.update(stations).set(stationStatusUpdate("inactive")).where(eq(stations.id, id));
        state.affectedStationIds.add(id);
        state.stationOrLocationWritten = true;
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(stations).where(eq(stations.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Updated station ${id} disappeared`);
      await audit.log({
        entity: "stations",
        op: "update",
        recordId: id,
        stationId: id,
        old: current,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }

  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The station no longer exists", "skip"));
    return plan;
  }

  const oldValues = requireSnapshot(entry.old_values, "old station");
  const newValues = requireSnapshot(entry.new_values, "new station");
  const fields = changedFields(stations, oldValues, newValues);
  const differences = staleFields(stations, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The station changed after this operation", "apply", { fields: differences }));

  await addForeignKeyConflicts(context, plan, oldValues, new Set(fields));
  if (fields.includes("station_id") || fields.includes("operator_id")) await addUniqueConflict(context, plan, id, oldValues);
  const desiredStatus = stationStatus(oldValues);
  plan.effects = [{ stationId: id, ...(fields.includes("status") && desiredStatus !== null ? { finalStatus: desiredStatus } : {}) }];
  plan.actions.push({
    order: 32,
    run: async (tx, state) => {
      const patch = snapshotToRow(stations, oldValues, { fields });
      if (plan.droppedFields.has("location_id")) patch.location_id = null;
      if (plan.droppedFields.has("operator_id")) patch.operator_id = null;
      const statusPatch = fields.includes("status") && desiredStatus !== null ? stationStatusUpdate(desiredStatus) : { updatedAt: new Date() };
      await tx
        .update(stations)
        .set({ ...patch, ...statusPatch })
        .where(eq(stations.id, id));
      state.affectedStationIds.add(id);
      state.stationOrLocationWritten = true;
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(stations).where(eq(stations.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated station ${id} disappeared`);
    await audit.log({
      entity: "stations",
      op: "update",
      recordId: id,
      stationId: id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}
