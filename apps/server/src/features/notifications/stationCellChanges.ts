import db from "../../database/psql.js";
import { logger } from "../../utils/logger.js";
import { buildInternalStationActionUrl } from "./actionUrls.js";
import { notifyStationWatchers } from "./service.js";

export interface StationCellChangeCounts {
  added?: number;
  removed?: number;
  updated?: number;
}

function positiveCount(value: number | undefined): number | undefined {
  if (value === undefined || value <= 0) return undefined;
  return value;
}

function buildMetadata(counts: StationCellChangeCounts): Record<string, number> {
  const metadata: Record<string, number> = {};
  const added = positiveCount(counts.added);
  const removed = positiveCount(counts.removed);
  const updated = positiveCount(counts.updated);

  if (added !== undefined) metadata.added = added;
  if (removed !== undefined) metadata.removed = removed;
  if (updated !== undefined) metadata.updated = updated;

  return metadata;
}

export async function notifyStationCellsChanged(params: { stationId: number; counts: StationCellChangeCounts }): Promise<void> {
  const metadata = buildMetadata(params.counts);
  if (Object.keys(metadata).length === 0) return;

  const station = await db.query.stations.findFirst({
    where: { id: params.stationId },
    columns: { id: true, station_id: true },
    with: { location: { columns: { latitude: true, longitude: true } } },
  });
  if (!station) return;

  await notifyStationWatchers({
    stationId: station.id,
    stationStringId: station.station_id,
    type: "station_cells_changed",
    metadata,
    actionUrl: buildInternalStationActionUrl(station),
  });
}

export function queueStationCellsChangedNotification(params: { stationId: number; counts: StationCellChangeCounts }): void {
  void notifyStationCellsChanged(params).catch((e) =>
    logger.error("Failed to notify station watchers about cell changes", {
      error: e instanceof Error ? e.message : String(e),
      stationId: params.stationId,
    }),
  );
}
