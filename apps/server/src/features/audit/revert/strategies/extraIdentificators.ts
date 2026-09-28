import { extraIdentificators, stations } from "@openbts/drizzle";
import { and, eq, isNull, ne } from "drizzle-orm";

import type { AuditEntry } from "../../types.js";
import { type SnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow } from "../columns.js";
import { changedFields, staleFields } from "../compare.js";
import { type ApplyState, type PlannedEntry, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, snapshotFieldNames } from "./common.js";

const EXTRA_ID_UNIQUE_CONSTRAINT = "extra_identificators_networks_id_unique";

async function addStationConflict(context: StrategyContext, plan: PlannedEntry, target: SnapshotRecord): Promise<void> {
  const stationId = numberField(target, "station_id");
  if (stationId === null) {
    plan.conflicts.push(conflictFor(plan.entry, "fk_missing", "The original station is invalid", "skip"));
    return;
  }
  const [station] = await context.tx.select({ id: stations.id }).from(stations).where(eq(stations.id, stationId)).limit(1);
  if (station === undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "fk_missing", "The original station no longer exists", "skip", {
        constraint: "extra_identificators_station_id_stations_id_fk",
      }),
    );
}

async function addUniqueConflict(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const stationId = numberField(target, "station_id");
  if (stationId === null) return;
  const networksId = numberField(target, "networks_id");
  const networkCondition = networksId === null ? isNull(extraIdentificators.networks_id) : eq(extraIdentificators.networks_id, networksId);
  const [duplicate] = await context.tx
    .select({ id: extraIdentificators.id })
    .from(extraIdentificators)
    .where(and(eq(extraIdentificators.station_id, stationId), networkCondition, ne(extraIdentificators.id, id)))
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The original network identifier is already in use", "skip", {
        constraint: EXTRA_ID_UNIQUE_CONSTRAINT,
      }),
    );
}

function markStations(state: ApplyState, ...stationIds: Array<number | null>): void {
  for (const stationId of stationIds) if (stationId !== null) state.affectedStationIds.add(stationId);
}

export async function planExtraIdentificatorRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const id = recordIdNumber(entry.record_id);
  if (id === null) return plan;
  const [current] = await context.tx.select().from(extraIdentificators).where(eq(extraIdentificators.id, id)).limit(1);

  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The network identifier is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new network identifier");
    const differences = staleFields(extraIdentificators, expected, current, snapshotFieldNames(expected));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The network identifier changed after this operation", "apply", { fields: differences }));
    plan.actions.push({
      order: 10,
      run: async (tx, state) => {
        await tx.delete(extraIdentificators).where(eq(extraIdentificators.id, id));
        markStations(state, current.station_id);
      },
    });
    plan.finalize = async (_tx, audit) => {
      await audit.log({
        entity: "extra_identificators",
        op: "delete",
        recordId: id,
        stationId: current.station_id,
        old: current,
        new: null,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }

  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "A network identifier with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old network identifier");
    await Promise.all([addStationConflict(context, plan, oldValues), addUniqueConflict(context, plan, id, oldValues)]);
    plan.actions.push({
      order: 25,
      run: async (tx, state) => {
        const row = snapshotToRow(extraIdentificators, oldValues, { includeIdentity: true });
        await tx
          .insert(extraIdentificators)
          .overridingSystemValue()
          .values({ ...row, id } as typeof extraIdentificators.$inferInsert);
        state.sequenceTables.add("extra_identificators");
        markStations(state, numberField(oldValues, "station_id"));
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(extraIdentificators).where(eq(extraIdentificators.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored network identifier ${id} disappeared`);
      await audit.log({
        entity: "extra_identificators",
        op: "create",
        recordId: id,
        stationId: restored.station_id,
        old: null,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }

  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The network identifier no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old network identifier");
  const newValues = requireSnapshot(entry.new_values, "new network identifier");
  const fields = changedFields(extraIdentificators, oldValues, newValues);
  const differences = staleFields(extraIdentificators, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The network identifier changed after this operation", "apply", { fields: differences }));
  if (fields.includes("station_id")) await addStationConflict(context, plan, oldValues);
  if (fields.includes("station_id") || fields.includes("networks_id")) await addUniqueConflict(context, plan, id, oldValues);

  plan.actions.push({
    order: 33,
    run: async (tx, state) => {
      const patch = snapshotToRow(extraIdentificators, oldValues, { fields });
      await tx
        .update(extraIdentificators)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(extraIdentificators.id, id));
      markStations(state, current.station_id, numberField(oldValues, "station_id"));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(extraIdentificators).where(eq(extraIdentificators.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated network identifier ${id} disappeared`);
    await audit.log({
      entity: "extra_identificators",
      op: "update",
      recordId: id,
      stationId: restored.station_id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}
