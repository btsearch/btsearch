import { stationBackhauls, stations } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";
import { createInsertSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import type { AuditEntry } from "../../types.js";
import { type SnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow } from "../columns.js";
import { changedFields, staleFields } from "../compare.js";
import { type ApplyState, type PlannedEntry, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, snapshotFieldNames } from "./common.js";

const stationBackhaulInsertSchema = createInsertSchema(stationBackhauls);

const BACKHAUL_UNIQUE_CONSTRAINT = "station_uplinks_station_id_unique";

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
        constraint: "station_uplinks_station_id_stations_id_fk",
      }),
    );
}

async function addUniqueConflict(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const stationId = numberField(target, "station_id");
  if (stationId === null) return;
  const [duplicate] = await context.tx
    .select({ id: stationBackhauls.id })
    .from(stationBackhauls)
    .where(and(eq(stationBackhauls.station_id, stationId), ne(stationBackhauls.id, id)))
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The station already has another backhaul", "skip", {
        constraint: BACKHAUL_UNIQUE_CONSTRAINT,
      }),
    );
}

function markStations(state: ApplyState, ...stationIds: (number | null)[]): void {
  for (const stationId of stationIds) if (stationId !== null) state.affectedStationIds.add(stationId);
}

export async function planStationBackhaulRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const id = recordIdNumber(entry.record_id);
  if (id === null) return plan;
  const [current] = await context.tx.select().from(stationBackhauls).where(eq(stationBackhauls.id, id)).limit(1);

  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The backhaul is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new backhaul");
    const differences = staleFields(stationBackhauls, expected, current, snapshotFieldNames(expected));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The backhaul changed after this operation", "apply", { fields: differences }));
    plan.actions.push({
      order: 10,
      run: async (tx, state) => {
        await tx.delete(stationBackhauls).where(eq(stationBackhauls.id, id));
        markStations(state, current.station_id);
      },
    });
    plan.finalize = async (_tx, audit) => {
      await audit.log({
        entity: "station_uplinks",
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
      plan.conflicts.push(conflictFor(entry, "exists", "A backhaul with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old backhaul");
    await Promise.all([addStationConflict(context, plan, oldValues), addUniqueConflict(context, plan, id, oldValues)]);
    plan.actions.push({
      order: 25,
      run: async (tx, state) => {
        const row = snapshotToRow(stationBackhauls, oldValues, { includeIdentity: true });
        await tx
          .insert(stationBackhauls)
          .overridingSystemValue()
          .values({ ...row, id } as z.infer<typeof stationBackhaulInsertSchema>);
        state.sequenceTables.add("station_uplinks");
        markStations(state, numberField(oldValues, "station_id"));
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(stationBackhauls).where(eq(stationBackhauls.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored backhaul ${id} disappeared`);
      await audit.log({
        entity: "station_uplinks",
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
    plan.conflicts.push(conflictFor(entry, "missing", "The backhaul no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old backhaul");
  const newValues = requireSnapshot(entry.new_values, "new backhaul");
  const fields = changedFields(stationBackhauls, oldValues, newValues);
  const differences = staleFields(stationBackhauls, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The backhaul changed after this operation", "apply", { fields: differences }));
  if (fields.includes("station_id"))
    await Promise.all([addStationConflict(context, plan, oldValues), addUniqueConflict(context, plan, id, oldValues)]);

  plan.actions.push({
    order: 33,
    run: async (tx, state) => {
      const patch = snapshotToRow(stationBackhauls, oldValues, { fields });
      await tx
        .update(stationBackhauls)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(stationBackhauls.id, id));
      markStations(state, current.station_id, numberField(oldValues, "station_id"));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(stationBackhauls).where(eq(stationBackhauls.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated backhaul ${id} disappeared`);
    await audit.log({
      entity: "station_uplinks",
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
