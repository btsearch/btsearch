import { locationPhotos } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";

import type { AuditEntry } from "../../types.js";
import { isSnapshotRecord, recordIdNumber, requireSnapshot } from "../columns.js";
import { changedFields, staleFields } from "../compare.js";
import { type PlannedEntry, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, pendingInsertProvider } from "./common.js";

const LOCATION_PHOTO_LOCATION_CONSTRAINT = "location_photos_location_id_locations_id_fk";
const LOCATION_PHOTO_UNIQUE_CONSTRAINT = "location_photos_location_attachment_unique";

function locationId(snapshot: Record<string, unknown>): number | null {
  const value = numberField(snapshot, "location_id");
  return value !== null && value > 0 ? value : null;
}

export function getLocationPhotoMove(entry: AuditEntry): { oldLocationId: number; newLocationId: number } | null {
  if (entry.entity !== "location_photos" || entry.op !== "update") return null;
  if (!isSnapshotRecord(entry.old_values) || !isSnapshotRecord(entry.new_values)) return null;
  const fields = changedFields(locationPhotos, entry.old_values, entry.new_values);
  if (fields.length !== 1 || fields[0] !== "location_id") return null;
  const oldLocationId = locationId(entry.old_values);
  const newLocationId = locationId(entry.new_values);
  if (oldLocationId === null || newLocationId === null || oldLocationId === newLocationId) return null;
  return { oldLocationId, newLocationId };
}

async function addLocationConflict(context: StrategyContext, plan: PlannedEntry, locationId: number): Promise<void> {
  const prerequisiteEntryId = pendingInsertProvider(context, "locations", locationId);
  if (prerequisiteEntryId !== undefined) {
    plan.dependencies.push({
      prerequisiteEntryId,
      failure: {
        kind: "fk_missing",
        message: "The photo's original location cannot be restored",
        forceResolution: "skip",
        constraint: LOCATION_PHOTO_LOCATION_CONSTRAINT,
      },
    });
    return;
  }

  const location = await context.tx.query.locations.findFirst({ where: { id: locationId }, columns: { id: true } });
  if (location === undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "fk_missing", "The photo's original location no longer exists", "skip", {
        constraint: LOCATION_PHOTO_LOCATION_CONSTRAINT,
      }),
    );
}

async function addUniqueConflict(
  context: StrategyContext,
  plan: PlannedEntry,
  id: number,
  targetLocationId: number,
  attachmentId: number,
): Promise<void> {
  const [duplicate] = await context.tx
    .select({ id: locationPhotos.id })
    .from(locationPhotos)
    .where(and(eq(locationPhotos.location_id, targetLocationId), eq(locationPhotos.attachment_id, attachmentId), ne(locationPhotos.id, id)))
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The photo already exists on its original location", "skip", {
        constraint: LOCATION_PHOTO_UNIQUE_CONSTRAINT,
      }),
    );
}

export async function planLocationPhotoRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const id = recordIdNumber(entry.record_id);
  const move = getLocationPhotoMove(entry);
  if (id === null || move === null) return plan;

  const [current] = await context.tx.select().from(locationPhotos).where(eq(locationPhotos.id, id)).limit(1);
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The location photo no longer exists", "skip"));
    return plan;
  }

  const newValues = requireSnapshot(entry.new_values, "new location photo");
  const differences = staleFields(locationPhotos, newValues, current, ["location_id"]);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The location photo moved after this operation", "apply", { fields: differences }));

  await Promise.all([
    addLocationConflict(context, plan, move.oldLocationId),
    addUniqueConflict(context, plan, id, move.oldLocationId, current.attachment_id),
  ]);

  plan.actions.push({
    order: 35,
    run: async (tx, state) => {
      await tx.update(locationPhotos).set({ location_id: move.oldLocationId }).where(eq(locationPhotos.id, id));
      state.touchedLocationIds.add(current.location_id);
      state.touchedLocationIds.add(move.oldLocationId);
      if (entry.station_id !== null) state.affectedStationIds.add(entry.station_id);
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(locationPhotos).where(eq(locationPhotos.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated location photo ${id} disappeared`);
    await audit.log({
      entity: "location_photos",
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
