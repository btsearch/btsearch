import { stationPhotoSelections } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import type { Database } from "../../database/psql.js";
import { createAuditLog } from "../auditLog.service.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type StationPhotoDatabase = Database | Transaction;

export type StationPhotoSelectionSnapshot = {
  location_photo_id: number;
  is_main: boolean;
};

export type StationPhotoSelectionSnapshots = Map<number, StationPhotoSelectionSnapshot[]>;

export async function loadStationPhotoSelectionSnapshots(
  handle: StationPhotoDatabase,
  stationIds: readonly number[],
): Promise<StationPhotoSelectionSnapshots> {
  const uniqueStationIds = [...new Set(stationIds)];
  const snapshots: StationPhotoSelectionSnapshots = new Map(uniqueStationIds.map((stationId) => [stationId, []]));
  if (uniqueStationIds.length === 0) return snapshots;

  const rows = await handle
    .select({
      station_id: stationPhotoSelections.station_id,
      location_photo_id: stationPhotoSelections.location_photo_id,
      is_main: stationPhotoSelections.is_main,
    })
    .from(stationPhotoSelections)
    .where(inArray(stationPhotoSelections.station_id, uniqueStationIds));

  for (const { station_id, location_photo_id, is_main } of rows) snapshots.get(station_id)?.push({ location_photo_id, is_main });

  return snapshots;
}

function selectionsChanged(previous: StationPhotoSelectionSnapshot[], next: StationPhotoSelectionSnapshot[]): boolean {
  if (previous.length !== next.length) return true;
  const nextByPhotoId = new Map(next.map((selection) => [selection.location_photo_id, selection.is_main]));
  return previous.some((selection) => nextByPhotoId.get(selection.location_photo_id) !== selection.is_main);
}

export async function createStationPhotoSelectionAuditLogs({
  handle,
  stationIds,
  previousSnapshots,
  req,
  metadata = {},
}: {
  handle: StationPhotoDatabase;
  stationIds: readonly number[];
  previousSnapshots: StationPhotoSelectionSnapshots;
  req: FastifyRequest;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const uniqueStationIds = [...new Set(stationIds)];
  const nextSnapshots = await loadStationPhotoSelectionSnapshots(handle, uniqueStationIds);

  /* eslint-disable no-await-in-loop */
  for (const stationId of uniqueStationIds) {
    const oldValues = previousSnapshots.get(stationId) ?? [];
    const newValues = nextSnapshots.get(stationId) ?? [];
    if (!selectionsChanged(oldValues, newValues)) continue;
    await createAuditLog(
      {
        action: "stations.update",
        table_name: "station_photo_selections",
        record_id: stationId,
        old_values: oldValues,
        new_values: newValues,
        metadata: { ...metadata, station_id: stationId },
      },
      req,
      handle,
    );
  }
  /* eslint-enable no-await-in-loop */
}
