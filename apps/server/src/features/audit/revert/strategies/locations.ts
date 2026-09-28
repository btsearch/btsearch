import { locationPhotos, locations, stations } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";

import type { AuditEntry } from "../../types.js";
import { type SnapshotRecord, isSnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow } from "../columns.js";
import { changedFields, staleFields } from "../compare.js";
import { type ApplyState, type PlannedEntry, type RevertDependent, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, pendingInsertProvider, snapshotFieldNames } from "./common.js";
import { getLocationPhotoMove } from "./locationPhotos.js";

const LOCATION_UNIQUE_CONSTRAINT = "locations_lonlat_unique";

function selectedStationMove(context: StrategyContext, stationId: number, locationId: number): number | undefined {
  const entry = context.selectedEntries.find(
    (candidate) => candidate.entity === "stations" && candidate.op !== "create" && Number(candidate.record_id) === stationId,
  );
  if (
    entry === undefined ||
    !isSnapshotRecord(entry.old_values) ||
    !isSnapshotRecord(entry.new_values) ||
    !("location_id" in entry.old_values) ||
    !("location_id" in entry.new_values)
  )
    return undefined;
  const oldLocationId = numberField(entry.old_values, "location_id");
  const newLocationId = numberField(entry.new_values, "location_id");
  return oldLocationId !== newLocationId && oldLocationId !== locationId ? entry.id : undefined;
}

function selectedPhotoMove(context: StrategyContext, photoId: number, locationId: number): number | undefined {
  const entry = context.selectedEntries.find(
    (candidate) => candidate.entity === "location_photos" && candidate.op === "update" && Number(candidate.record_id) === photoId,
  );
  if (entry === undefined) return undefined;
  const move = getLocationPhotoMove(entry);
  return move !== null && move.oldLocationId !== locationId ? entry.id : undefined;
}

async function dependents(context: StrategyContext, plan: PlannedEntry, locationId: number): Promise<RevertDependent[]> {
  const [stationRows, photoRows] = await Promise.all([
    context.tx.select({ id: stations.id }).from(stations).where(eq(stations.location_id, locationId)),
    context.tx.select({ id: locationPhotos.id }).from(locationPhotos).where(eq(locationPhotos.location_id, locationId)),
  ]);
  const stationaryStations = stationRows.filter((station) => {
    const prerequisiteEntryId = selectedStationMove(context, station.id, locationId);
    if (prerequisiteEntryId === undefined) return true;
    plan.dependencies.push({
      prerequisiteEntryId,
      failure: {
        kind: "referenced",
        message: "The location remains assigned to a station whose revert cannot move it",
        forceResolution: "skip",
        dependents: [{ table: "stations", count: 1 }],
      },
    });
    return false;
  });
  const stationaryPhotos = photoRows.filter((photo) => {
    const prerequisiteEntryId = selectedPhotoMove(context, photo.id, locationId);
    if (prerequisiteEntryId === undefined) return true;
    plan.dependencies.push({
      prerequisiteEntryId,
      failure: {
        kind: "referenced",
        message: "The location still contains a photo whose revert cannot move it",
        forceResolution: "skip",
        dependents: [{ table: "location_photos", count: 1 }],
      },
    });
    return false;
  });
  return [
    { table: "stations", count: stationaryStations.length },
    { table: "location_photos", count: stationaryPhotos.length },
  ].filter((item) => item.count > 0);
}

async function addRegionConflict(context: StrategyContext, plan: PlannedEntry, target: SnapshotRecord, fields: ReadonlySet<string>): Promise<void> {
  if (!fields.has("region_id")) return;
  const regionId = numberField(target, "region_id");
  if (regionId === null) {
    plan.conflicts.push(conflictFor(plan.entry, "fk_missing", "The original region is invalid", "skip"));
    return;
  }
  const prerequisiteEntryId = pendingInsertProvider(context, "regions", regionId);
  if (prerequisiteEntryId !== undefined) {
    plan.dependencies.push({
      prerequisiteEntryId,
      failure: {
        kind: "fk_missing",
        message: "The original region cannot be restored",
        forceResolution: "skip",
        constraint: "locations_region_id_regions_id_fk",
      },
    });
    return;
  }
  const region = await context.tx.query.regions.findFirst({ where: { id: regionId }, columns: { id: true } });
  if (region === undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "fk_missing", "The original region no longer exists", "skip", {
        constraint: "locations_region_id_regions_id_fk",
      }),
    );
}

async function addUniqueConflict(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const longitude = target.longitude;
  const latitude = target.latitude;
  if (typeof longitude !== "number" || typeof latitude !== "number") return;
  const [duplicate] = await context.tx
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.longitude, longitude), eq(locations.latitude, latitude), ne(locations.id, id)))
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The original coordinates are already in use", "skip", {
        constraint: LOCATION_UNIQUE_CONSTRAINT,
      }),
    );
}

function markLocationWrite(state: ApplyState, locationId: number, stationId: number | null): void {
  state.touchedLocationIds.add(locationId);
  state.stationOrLocationWritten = true;
  if (stationId !== null) state.affectedStationIds.add(stationId);
}

export async function planLocationRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const id = recordIdNumber(entry.record_id);
  if (id === null) return plan;
  const [current] = await context.tx.select().from(locations).where(eq(locations.id, id)).limit(1);

  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The location is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new location");
    const differences = staleFields(locations, expected, current, snapshotFieldNames(expected, ["point"]));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The location changed after this operation", "apply", { fields: differences }));
    const referencedBy = await dependents(context, plan, id);
    if (referencedBy.length > 0)
      plan.conflicts.push(conflictFor(entry, "referenced", "The location is still referenced", "skip", { dependents: referencedBy }));

    plan.actions.push({
      order: 50,
      run: async (tx, state) => {
        await tx.delete(locations).where(eq(locations.id, id));
        markLocationWrite(state, id, entry.station_id);
      },
    });
    plan.finalize = async (_tx, audit) => {
      await audit.log({
        entity: "locations",
        op: "delete",
        recordId: id,
        stationId: entry.station_id,
        old: current,
        new: null,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }

  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "A location with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old location");
    await Promise.all([addRegionConflict(context, plan, oldValues, new Set(["region_id"])), addUniqueConflict(context, plan, id, oldValues)]);
    plan.actions.push({
      order: 23,
      run: async (tx, state) => {
        const row = snapshotToRow(locations, oldValues, { includeIdentity: true, omit: ["point"] });
        await tx
          .insert(locations)
          .overridingSystemValue()
          .values({ ...row, id } as typeof locations.$inferInsert);
        state.sequenceTables.add("locations");
        markLocationWrite(state, id, entry.station_id);
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(locations).where(eq(locations.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored location ${id} disappeared`);
      await audit.log({
        entity: "locations",
        op: "create",
        recordId: id,
        stationId: entry.station_id,
        old: null,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }

  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The location no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old location");
  const newValues = requireSnapshot(entry.new_values, "new location");
  const fields = changedFields(locations, oldValues, newValues);
  const differences = staleFields(locations, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The location changed after this operation", "apply", { fields: differences }));
  await addRegionConflict(context, plan, oldValues, new Set(fields));
  if (fields.includes("longitude") || fields.includes("latitude")) await addUniqueConflict(context, plan, id, oldValues);

  plan.actions.push({
    order: 31,
    run: async (tx, state) => {
      const patch = snapshotToRow(locations, oldValues, { fields });
      await tx
        .update(locations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(locations.id, id));
      markLocationWrite(state, id, entry.station_id);
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(locations).where(eq(locations.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated location ${id} disappeared`);
    await audit.log({
      entity: "locations",
      op: "update",
      recordId: id,
      stationId: entry.station_id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}
