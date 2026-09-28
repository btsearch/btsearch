import { stations } from "@openbts/drizzle";
import { DrizzleQueryError, inArray } from "drizzle-orm";
import postgres from "postgres";

import { DetailedErrorResponse } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import type { AuditRecorder } from "../types.js";
import { bumpIdentitySequences } from "./sequences.js";
import { appliedSkippedFields } from "./strategies/common.js";
import {
  type ApplyState,
  type PlannedConflict,
  type PlannedEntry,
  type RevertConflict,
  type RevertSkipped,
  type RevertSkippedField,
  conflictFor,
  emptyApplyState,
} from "./types.js";

export type AppliedRevertPlan = {
  reverted: number[];
  skipped: RevertSkipped[];
  skippedFields: RevertSkippedField[];
  affectedStationIds: number[];
  cellChanges: ApplyState["cellChanges"];
  stationOrLocationWritten: boolean;
};

function publicConflict(conflict: PlannedConflict): RevertConflict {
  const { forceResolution: _forceResolution, nullableField: _nullableField, ...result } = conflict;
  return result;
}

function postgresError(error: unknown): postgres.PostgresError | null {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return cause instanceof postgres.PostgresError ? cause : null;
}

function databaseConflict(plan: PlannedEntry, error: unknown): RevertConflict | null {
  const cause = postgresError(error);
  if (cause === null) return null;
  if (cause.code === "23505")
    return publicConflict(
      conflictFor(plan.entry, "unique_violation", "Restoring this change violates a unique constraint", "skip", {
        constraint: cause.constraint_name,
      }),
    );
  if (cause.code === "23503")
    return publicConflict(
      conflictFor(plan.entry, "fk_missing", "Restoring this change violates a foreign-key constraint", "skip", {
        constraint: cause.constraint_name,
      }),
    );
  return null;
}

async function runPlanStep(plan: PlannedEntry, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    const conflict = databaseConflict(plan, error);
    if (conflict !== null) throw new DetailedErrorResponse("CONFLICT", [conflict], { cause: error });
    throw error;
  }
}

function resolvePlans(plans: readonly PlannedEntry[], force: boolean): { active: PlannedEntry[]; skipped: RevertSkipped[] } {
  const conflicts = plans.flatMap((plan) => plan.conflicts);
  if (!force && conflicts.length > 0)
    throw new DetailedErrorResponse("CONFLICT", conflicts.map(publicConflict), { message: "Data changed since this operation" });

  const active: PlannedEntry[] = [];
  const skipped: RevertSkipped[] = [];
  for (const plan of plans) {
    if (plan.skip !== undefined) {
      skipped.push(plan.skip);
      continue;
    }
    const blocking = plan.conflicts.find((conflict) => conflict.forceResolution === "skip");
    if (blocking !== undefined) {
      skipped.push({ entry_id: plan.entry.id, reason: blocking.kind, message: blocking.message });
      continue;
    }
    for (const conflict of plan.conflicts)
      if (conflict.forceResolution === "drop_field" && conflict.nullableField !== undefined) plan.droppedFields.add(conflict.nullableField);
    active.push(plan);
  }
  return { active, skipped };
}

async function includeStationsAtLocations(tx: DbTx, state: ApplyState): Promise<void> {
  if (state.touchedLocationIds.size === 0) return;
  const rows = await tx
    .select({ id: stations.id })
    .from(stations)
    .where(inArray(stations.location_id, [...state.touchedLocationIds]));
  for (const row of rows) state.affectedStationIds.add(row.id);
}

export async function applyRevertPlan(tx: DbTx, audit: AuditRecorder, plans: readonly PlannedEntry[], force: boolean): Promise<AppliedRevertPlan> {
  const { active, skipped } = resolvePlans(plans, force);
  const state = emptyApplyState();
  const actions = active
    .flatMap((plan) => plan.actions.map((action) => ({ ...action, plan })))
    .sort((left, right) => left.order - right.order || right.plan.entry.id - left.plan.entry.id);
  // eslint-disable-next-line no-await-in-loop
  for (const action of actions) await runPlanStep(action.plan, () => action.run(tx, state));
  await includeStationsAtLocations(tx, state);
  if (state.affectedStationIds.size > 0)
    await tx
      .update(stations)
      .set({ updatedAt: new Date() })
      .where(inArray(stations.id, [...state.affectedStationIds]));
  await bumpIdentitySequences(tx, state.sequenceTables);

  const finalizePlans = [...active].sort((left, right) => right.entry.id - left.entry.id);
  // eslint-disable-next-line no-await-in-loop
  for (const plan of finalizePlans) await runPlanStep(plan, () => plan.finalize(tx, audit, state));

  return {
    reverted: finalizePlans.map((plan) => plan.entry.id),
    skipped,
    skippedFields: finalizePlans.flatMap(appliedSkippedFields),
    affectedStationIds: [...state.affectedStationIds].sort((left, right) => left - right),
    cellChanges: state.cellChanges,
    stationOrLocationWritten: state.stationOrLocationWritten,
  };
}
