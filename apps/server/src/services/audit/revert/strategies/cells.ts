import { bands, cells, gsmCells, lteCells, nrCells, proposedCells, stationSectors, stations, umtsCells } from "@openbts/drizzle";
import { count, eq } from "drizzle-orm";

import {
  type NormalRat,
  type RATInsertDetails,
  type RATUpdateDetails,
  insertRATCellDetailsReturning,
  isNormalRat,
  updateRATCellDetailsReturning,
} from "../../../../utils/ratCellPersistence.js";
import { loadCellSnapshots } from "../../snapshots.js";
import type { AuditEntry } from "../../types.js";
import { type SnapshotRecord, isSnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow, writableColumnNames } from "../columns.js";
import { changedFields, staleFields, staleNestedFields } from "../compare.js";
import { type ApplyState, type PlannedEntry, type StrategyContext, addCellChange, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, pendingInsertProvider, stringField } from "./common.js";

function detailsSnapshot(snapshot: SnapshotRecord, rat: string): SnapshotRecord | null {
  if (isSnapshotRecord(snapshot.details)) return snapshot.details;
  const legacy = snapshot[rat.toLowerCase()];
  return isSnapshotRecord(legacy) ? legacy : null;
}

function ratTable(rat: NormalRat) {
  switch (rat) {
    case "GSM":
      return gsmCells;
    case "UMTS":
      return umtsCells;
    case "LTE":
      return lteCells;
    case "NR":
      return nrCells;
  }
}

async function rowExists(context: StrategyContext, table: typeof stations | typeof bands | typeof stationSectors, id: number): Promise<boolean> {
  const [row] = await context.tx.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return row !== undefined;
}

async function addForeignKeyConflicts(
  context: StrategyContext,
  plan: PlannedEntry,
  target: SnapshotRecord,
  fields: ReadonlySet<string>,
): Promise<void> {
  const stationId = numberField(target, "station_id");
  if (fields.has("station_id") && stationId !== null && !(await rowExists(context, stations, stationId)))
    plan.conflicts.push(
      conflictFor(plan.entry, "fk_missing", "The original station no longer exists", "skip", { constraint: "cells_station_id_stations_id_fk" }),
    );

  const bandId = numberField(target, "band_id");
  if (fields.has("band_id") && bandId !== null) {
    const prerequisiteEntryId = pendingInsertProvider(context, "bands", bandId);
    if (prerequisiteEntryId !== undefined)
      plan.dependencies.push({
        prerequisiteEntryId,
        failure: {
          kind: "fk_missing",
          message: "The original band cannot be restored",
          forceResolution: "skip",
          constraint: "cells_band_id_bands_id_fk",
        },
      });
    else if (!(await rowExists(context, bands, bandId)))
      plan.conflicts.push(
        conflictFor(plan.entry, "fk_missing", "The original band no longer exists", "skip", { constraint: "cells_band_id_bands_id_fk" }),
      );
  }

  const sectorId = numberField(target, "sector_id");
  if (fields.has("sector_id") && sectorId !== null) {
    const prerequisiteEntryId = pendingInsertProvider(context, "station_sectors", sectorId);
    if (prerequisiteEntryId !== undefined)
      plan.dependencies.push({
        prerequisiteEntryId,
        failure: {
          kind: "fk_missing",
          message: "The original sector cannot be restored",
          forceResolution: "drop_field",
          nullableField: "sector_id",
          constraint: "cells_sector_id_station_sectors_id_fk",
        },
      });
    else if (!(await rowExists(context, stationSectors, sectorId)))
      plan.conflicts.push(
        conflictFor(plan.entry, "fk_missing", "The original sector no longer exists", "drop_field", {
          constraint: "cells_sector_id_station_sectors_id_fk",
          nullableField: "sector_id",
        }),
      );
  }
}

function restoredSectorId(context: StrategyContext, plan: PlannedEntry, state: ApplyState, sectorId: number | null) {
  if (sectorId === null || plan.droppedFields.has("sector_id")) return null;
  const remappedId = state.sectorIdRemap.get(sectorId);
  if (pendingInsertProvider(context, "station_sectors", sectorId) !== undefined && remappedId === undefined)
    throw new Error(`Sector ${sectorId} was not restored before its dependent cell`);
  return remappedId ?? sectorId;
}

function cellEffects(oldValues: SnapshotRecord | null, newValues: SnapshotRecord | null): PlannedEntry["effects"] {
  const oldStationId = oldValues === null ? null : numberField(oldValues, "station_id");
  const newStationId = newValues === null ? null : numberField(newValues, "station_id");
  if (oldStationId === newStationId) return oldStationId === null ? [] : [{ stationId: oldStationId }];
  return [
    ...(newStationId === null ? [] : [{ stationId: newStationId, cellDelta: -1 }]),
    ...(oldStationId === null ? [] : [{ stationId: oldStationId, cellDelta: 1 }]),
  ];
}

export async function planCellRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const id = recordIdNumber(entry.record_id);
  if (id === null) return plan;

  const current = (await loadCellSnapshots(context.tx, [id])).get(id) ?? null;
  const oldValues = entry.old_values === null ? null : requireSnapshot(entry.old_values, "old cell");
  const newValues = entry.new_values === null ? null : requireSnapshot(entry.new_values, "new cell");
  plan.effects = cellEffects(oldValues, newValues);

  if (entry.op === "create") {
    if (current === null) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The cell is already absent" };
      return plan;
    }
    if (newValues !== null) {
      const fields = writableColumnNames(cells).filter((field) => Object.hasOwn(newValues, field) && field !== "createdAt" && field !== "updatedAt");
      const differences = staleFields(cells, newValues, current, fields);
      const rat = stringField(newValues, "rat") ?? current.rat;
      const expectedDetails = detailsSnapshot(newValues, rat);
      const currentDetails = isSnapshotRecord(current.details) ? current.details : null;
      if (expectedDetails !== null) {
        if (currentDetails === null) differences.push({ field: "details", expected: expectedDetails, current: null });
        else {
          const detailFields = isNormalRat(rat)
            ? writableColumnNames(ratTable(rat)).filter(
                (field) => Object.hasOwn(expectedDetails, field) && field !== "createdAt" && field !== "updatedAt",
              )
            : [];
          differences.push(...staleNestedFields("details", expectedDetails, currentDetails, detailFields));
        }
      }
      if (differences.length > 0)
        plan.conflicts.push(conflictFor(entry, "stale", "The cell changed after this operation", "apply", { fields: differences }));
    }

    const [proposalReferences] = await context.tx.select({ value: count() }).from(proposedCells).where(eq(proposedCells.target_cell_id, id));
    const proposalReferenceCount = proposalReferences?.value ?? 0;
    if (proposalReferenceCount > 0)
      plan.conflicts.push(
        conflictFor(entry, "referenced", "The cell is still referenced by a pending submission", "skip", {
          dependents: [{ table: "submissions.proposed_cells", count: proposalReferenceCount }],
        }),
      );

    plan.actions.push({
      order: 10,
      run: async (tx, state) => {
        await tx.delete(cells).where(eq(cells.id, id));
        addCellChange(state, current.station_id, "removed");
      },
    });
    plan.finalize = async (_tx, audit) => {
      await audit.log({
        entity: "cells",
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
    if (current !== null) {
      plan.conflicts.push(conflictFor(entry, "exists", "A cell with this id already exists", "skip"));
      return plan;
    }
    if (oldValues === null) return plan;

    const rat = stringField(oldValues, "rat") ?? "";
    const details = detailsSnapshot(oldValues, rat);
    await addForeignKeyConflicts(context, plan, oldValues, new Set(["station_id", "band_id", "sector_id"]));
    plan.actions.push({
      order: 26,
      run: async (tx, state) => {
        const sectorId = numberField(oldValues, "sector_id");
        const cellRow = snapshotToRow(cells, oldValues, { includeIdentity: true, omit: ["details"] });
        const sectorToRestore = restoredSectorId(context, plan, state, sectorId);
        await tx
          .insert(cells)
          .overridingSystemValue()
          .values({ ...cellRow, id, sector_id: sectorToRestore } as typeof cells.$inferInsert);
        if (isNormalRat(rat) && details !== null) {
          const restored = await insertRATCellDetailsReturning(tx, rat, id, details as unknown as RATInsertDetails);
          if (restored === null) throw new Error(`Failed to restore ${rat} details for cell ${id}`);
        }
        const stationId = numberField(oldValues, "station_id");
        if (stationId !== null) addCellChange(state, stationId, "added");
        state.sequenceTables.add("cells");
      },
    });
    plan.finalize = async (tx, audit) => {
      const restored = (await loadCellSnapshots(tx, [id])).get(id);
      if (restored === undefined) throw new Error(`Restored cell ${id} disappeared`);
      await audit.log({
        entity: "cells",
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

  if (current === null) {
    plan.conflicts.push(conflictFor(entry, "missing", "The cell no longer exists", "skip"));
    return plan;
  }
  if (oldValues === null || newValues === null) return plan;

  const baseFields = changedFields(cells, oldValues, newValues);
  const oldRat = stringField(oldValues, "rat") ?? "";
  const newRat = stringField(newValues, "rat") ?? "";
  if (oldRat !== newRat) {
    plan.conflicts.push(
      conflictFor(entry, "stale", "Changing a cell RAT cannot be reverted", "skip", {
        fields: [{ field: "rat", expected: newRat, current: current.rat }],
      }),
    );
    return plan;
  }

  const oldDetails = detailsSnapshot(oldValues, oldRat);
  const newDetails = detailsSnapshot(newValues, newRat);
  const currentDetails = isSnapshotRecord(current.details) ? current.details : null;
  const detailFields =
    isNormalRat(oldRat) && oldDetails !== null && newDetails !== null ? changedFields(ratTable(oldRat), oldDetails, newDetails) : [];
  const differences = staleFields(cells, newValues, current, baseFields);
  if (detailFields.length > 0) {
    if (currentDetails === null) plan.conflicts.push(conflictFor(entry, "missing", "The cell's RAT details no longer exist", "skip"));
    else if (newDetails !== null) differences.push(...staleNestedFields("details", newDetails, currentDetails, detailFields));
  }
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The cell changed after this operation", "apply", { fields: differences }));

  await addForeignKeyConflicts(context, plan, oldValues, new Set(baseFields));
  plan.actions.push({
    order: 34,
    run: async (tx, state) => {
      if (baseFields.length > 0) {
        const sectorId = numberField(oldValues, "sector_id");
        const patch = snapshotToRow(cells, oldValues, { fields: baseFields });
        if (baseFields.includes("sector_id")) patch.sector_id = restoredSectorId(context, plan, state, sectorId);
        await tx
          .update(cells)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(cells.id, id));
      }
      if (isNormalRat(oldRat) && oldDetails !== null && detailFields.length > 0) {
        const detailPatch = snapshotToRow(ratTable(oldRat), oldDetails, { fields: detailFields, omit: ["cell_id"] });
        const restored = await updateRATCellDetailsReturning(tx, oldRat, id, detailPatch as unknown as RATUpdateDetails);
        if (restored === null) throw new Error(`Failed to restore ${oldRat} details for cell ${id}`);
      }
      const restoredStationId = numberField(oldValues, "station_id");
      if (restoredStationId !== null && restoredStationId !== current.station_id) {
        addCellChange(state, current.station_id, "removed");
        addCellChange(state, restoredStationId, "added");
      } else addCellChange(state, current.station_id, "updated");
    },
  });
  plan.finalize = async (tx, audit) => {
    const restored = (await loadCellSnapshots(tx, [id])).get(id);
    if (restored === undefined) throw new Error(`Updated cell ${id} disappeared`);
    await audit.log({
      entity: "cells",
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
