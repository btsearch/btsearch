import { locationPhotos, stationPhotoSelections, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import { type PhotoSelectionSnapshot, loadPhotoSelectionSnapshots } from "../../snapshots.js";
import type { AuditEntry } from "../../types.js";
import { isSnapshotRecord } from "../columns.js";
import { valuesEqual } from "../compare.js";
import { type PlannedEntry, type StrategyContext, conflictFor } from "../types.js";
import { asSnapshotArray, createEmptyPlan, inverseMetadata, numberField } from "./common.js";

function selectionSnapshots(value: unknown): PhotoSelectionSnapshot[] | null {
  const rows = asSnapshotArray(value);
  if (rows === null) return null;
  const selections: PhotoSelectionSnapshot[] = [];
  for (const row of rows) {
    const locationPhotoId = numberField(row, "location_photo_id");
    if (locationPhotoId === null || typeof row.is_main !== "boolean") return null;
    selections.push({ location_photo_id: locationPhotoId, is_main: row.is_main });
  }
  return selections.sort((left, right) => left.location_photo_id - right.location_photo_id);
}

type PlannedStationLocation = { locationId: number | null; prerequisiteEntryId?: number };

function plannedStationLocation(context: StrategyContext, stationId: number, currentLocationId: number | null): PlannedStationLocation {
  const stationEntry = context.selectedEntries.find(
    (candidate) => candidate.entity === "stations" && Number(candidate.record_id) === stationId && candidate.op !== "create",
  );
  if (
    stationEntry === undefined ||
    !isSnapshotRecord(stationEntry.old_values) ||
    !isSnapshotRecord(stationEntry.new_values) ||
    !("location_id" in stationEntry.old_values) ||
    !("location_id" in stationEntry.new_values)
  )
    return { locationId: currentLocationId };
  const oldLocationId = numberField(stationEntry.old_values, "location_id");
  const newLocationId = numberField(stationEntry.new_values, "location_id");
  if (oldLocationId === newLocationId || oldLocationId === currentLocationId) return { locationId: currentLocationId };
  return { locationId: oldLocationId, prerequisiteEntryId: stationEntry.id };
}

export async function planPhotoSelectionRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  if (entry.op !== "update" || entry.station_id === null) return plan;
  const stationId = entry.station_id;
  const [station] = await context.tx
    .select({ id: stations.id, locationId: stations.location_id })
    .from(stations)
    .where(eq(stations.id, stationId))
    .limit(1);
  if (station === undefined) {
    plan.conflicts.push(conflictFor(entry, "fk_missing", "The station no longer exists", "skip"));
    return plan;
  }

  const desired = selectionSnapshots(entry.old_values);
  const expected = selectionSnapshots(entry.new_values);
  if (desired === null || expected === null) return plan;
  const current = (await loadPhotoSelectionSnapshots(context.tx, [stationId])).get(stationId) ?? [];
  const sortedCurrent = [...current].sort((left, right) => left.location_photo_id - right.location_photo_id);
  if (!valuesEqual(expected, sortedCurrent))
    plan.conflicts.push(
      conflictFor(entry, "stale", "The station photo selection changed after this operation", "apply", {
        fields: [{ field: "photos", expected, current: sortedCurrent }],
      }),
    );

  const desiredPhotoIds = desired.map((selection) => selection.location_photo_id);
  const uniqueDesiredPhotoIds = new Set(desiredPhotoIds);
  if (uniqueDesiredPhotoIds.size !== desiredPhotoIds.length)
    plan.conflicts.push(conflictFor(entry, "unique_violation", "The original photo selection contains duplicates", "skip"));
  if (desiredPhotoIds.length > 0) {
    const { locationId, prerequisiteEntryId } = plannedStationLocation(context, stationId, station.locationId);
    if (prerequisiteEntryId !== undefined)
      plan.dependencies.push({
        prerequisiteEntryId,
        prerequisiteField: "location_id",
        failure: {
          kind: "fk_missing",
          message: "The station's original location cannot be restored",
          forceResolution: "skip",
          constraint: "station_photo_selections_location_photo_id_location_photos_id_fk",
        },
      });
    const validPhotos =
      locationId === null
        ? []
        : await context.tx
            .select({ id: locationPhotos.id })
            .from(locationPhotos)
            .where(and(inArray(locationPhotos.id, desiredPhotoIds), eq(locationPhotos.location_id, locationId)));
    if (validPhotos.length !== uniqueDesiredPhotoIds.size)
      plan.conflicts.push(
        conflictFor(entry, "fk_missing", "Some original photos no longer exist on the station location", "skip", {
          constraint: "station_photo_selections_location_photo_id_location_photos_id_fk",
        }),
      );
  }

  plan.actions.push({
    order: 61,
    run: async (tx, state) => {
      await tx.delete(stationPhotoSelections).where(eq(stationPhotoSelections.station_id, stationId));
      if (desired.length > 0) await tx.insert(stationPhotoSelections).values(desired.map((selection) => ({ station_id: stationId, ...selection })));
      state.affectedStationIds.add(stationId);
    },
  });
  plan.effects = [{ stationId }];
  plan.finalize = async (tx, audit) => {
    const restored = (await loadPhotoSelectionSnapshots(tx, [stationId])).get(stationId) ?? [];
    await audit.log({
      entity: "station_photo_selections",
      op: "update",
      recordId: null,
      stationId,
      old: sortedCurrent,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}
