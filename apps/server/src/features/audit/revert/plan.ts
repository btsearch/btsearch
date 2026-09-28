import { cells, stations } from "@openbts/drizzle";
import type { AuditEntity } from "@openbts/shared/audit";
import { count, inArray } from "drizzle-orm";

import type { AuditEntry } from "../types.js";
import { asSnapshotArray, createEmptyPlan, numberField } from "./strategies/common.js";
import { strategyFor } from "./strategies/index.js";
import { type PendingInserts, type PlanDependency, type PlannedEntry, type StrategyContext, conflictFor } from "./types.js";

const INSERTABLE_ENTITIES = new Set<AuditEntity>(["locations", "operators", "bands", "regions"]);

function addPending(map: Map<AuditEntity, Map<number, number>>, entity: AuditEntity, id: number, entryId: number): void {
  const providers = map.get(entity) ?? new Map<number, number>();
  providers.set(id, entryId);
  map.set(entity, providers);
}

function pendingInserts(entries: readonly AuditEntry[]): PendingInserts {
  const pending = new Map<AuditEntity, Map<number, number>>();
  for (const entry of entries) {
    if (entry.op === "delete" && INSERTABLE_ENTITIES.has(entry.entity) && entry.record_id !== null) {
      const id = Number(entry.record_id);
      if (Number.isSafeInteger(id) && id > 0) addPending(pending, entry.entity, id, entry.id);
    }
    if (entry.entity !== "station_sectors" || entry.op !== "update") continue;
    const sectors = asSnapshotArray(entry.old_values);
    if (sectors === null) continue;
    for (const sector of sectors) {
      const id = numberField(sector, "id");
      if (id !== null) addPending(pending, "station_sectors", id, entry.id);
    }
  }
  return pending;
}

function willBeForceSkipped(plan: PlannedEntry): boolean {
  return plan.skip !== undefined || plan.conflicts.some((conflict) => conflict.forceResolution === "skip");
}

function dropsFieldWhenForced(plan: PlannedEntry, field: string): boolean {
  return plan.conflicts.some((conflict) => conflict.forceResolution === "drop_field" && conflict.nullableField === field);
}

function propagateDependencies(plans: PlannedEntry[]): void {
  const byEntryId = new Map(plans.map((plan) => [plan.entry.id, plan]));
  const processed = new Set<PlanDependency>();
  let addedConflict = true;
  while (addedConflict) {
    addedConflict = false;
    for (const plan of plans) {
      for (const dependency of plan.dependencies) {
        if (processed.has(dependency)) continue;
        const prerequisite = byEntryId.get(dependency.prerequisiteEntryId);
        const unavailable =
          prerequisite === undefined ||
          willBeForceSkipped(prerequisite) ||
          (dependency.prerequisiteField !== undefined && dropsFieldWhenForced(prerequisite, dependency.prerequisiteField));
        if (!unavailable) continue;
        const { kind, message, forceResolution, ...extras } = dependency.failure;
        plan.conflicts.push(conflictFor(plan.entry, kind, message, forceResolution, extras));
        processed.add(dependency);
        addedConflict = true;
      }
    }
  }
}

async function addStationCellInvariantConflicts(context: StrategyContext, plans: PlannedEntry[]): Promise<void> {
  const actionable = plans.filter((plan) => !willBeForceSkipped(plan));
  const affectedIds = [...new Set(actionable.flatMap((plan) => plan.effects.map((effect) => effect.stationId)))];
  if (affectedIds.length === 0) return;
  const [stationRows, countRows] = await Promise.all([
    context.tx.select({ id: stations.id, status: stations.status }).from(stations).where(inArray(stations.id, affectedIds)),
    context.tx
      .select({ stationId: cells.station_id, value: count() })
      .from(cells)
      .where(inArray(cells.station_id, affectedIds))
      .groupBy(cells.station_id),
  ]);
  const statuses = new Map(stationRows.map((row) => [row.id, row.status]));
  const counts = new Map(countRows.map((row) => [row.stationId, row.value]));

  for (const stationId of affectedIds) {
    let projectedCount = counts.get(stationId) ?? 0;
    let projectedStatus = statuses.get(stationId);
    let responsible: PlannedEntry | undefined;
    for (const plan of actionable) {
      for (const effect of plan.effects) {
        if (effect.stationId !== stationId) continue;
        projectedCount += effect.cellDelta ?? 0;
        if (effect.finalStatus !== undefined) projectedStatus = effect.finalStatus;
        if (effect.cellDelta !== undefined || effect.finalStatus === "published") responsible = plan;
      }
    }
    if (projectedStatus !== "published" || projectedCount > 0 || responsible === undefined) continue;
    responsible.conflicts.push(conflictFor(responsible.entry, "station_without_cells", "A published station would be left without cells", "apply"));
  }
}

export async function buildRevertPlan(tx: StrategyContext["tx"], entries: readonly AuditEntry[]): Promise<PlannedEntry[]> {
  const context: StrategyContext = { tx, pendingInserts: pendingInserts(entries), selectedEntries: entries };
  const plans = await Promise.all(
    entries.map(async (entry) => {
      const strategy = strategyFor(entry.entity);
      if (strategy === null)
        return {
          ...createEmptyPlan(entry),
          skip: { entry_id: entry.id, reason: "unsupported_entity", message: `${entry.entity} cannot be reverted` },
        } satisfies PlannedEntry;
      const plan = await strategy(context, entry);
      if (plan.actions.length > 0 || plan.skip !== undefined || plan.conflicts.length > 0) return plan;
      return {
        ...plan,
        skip: { entry_id: entry.id, reason: "unsupported_op", message: "This audit entry cannot be safely reverted" },
      };
    }),
  );
  propagateDependencies(plans);
  await addStationCellInvariantConflicts(context, plans);
  return plans;
}
