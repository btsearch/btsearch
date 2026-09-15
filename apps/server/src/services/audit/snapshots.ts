import { cells, gsmCells, lteCells, nrCells, stationPhotoSelections, stationSectors, umtsCells } from "@openbts/drizzle";
import { asc, eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../types/global.js";
import type { AuditMetadata, AuditRecorder } from "./types.js";

type CellWithRatRows = typeof cells.$inferSelect & {
  gsm: typeof gsmCells.$inferSelect | null;
  umts: typeof umtsCells.$inferSelect | null;
  lte: typeof lteCells.$inferSelect | null;
  nr: typeof nrCells.$inferSelect | null;
};

type RatSnapshot =
  | Omit<typeof gsmCells.$inferSelect, "cell_id">
  | Omit<typeof umtsCells.$inferSelect, "cell_id">
  | Omit<typeof lteCells.$inferSelect, "cell_id">
  | Omit<typeof nrCells.$inferSelect, "cell_id">;

export type CellSnapshot = typeof cells.$inferSelect & { details: RatSnapshot | null };
export type SectorSnapshot = { id: number; azimuth: number };
export type PhotoSelectionSnapshot = { location_photo_id: number; is_main: boolean };
export type PhotoSelectionSnapshots = Map<number, PhotoSelectionSnapshot[]>;

function omitCellId<T extends { cell_id: number }>(row: T): Omit<T, "cell_id"> {
  const { cell_id: _cellId, ...details } = row;
  return details;
}

export function flattenCellRow(row: CellWithRatRows): CellSnapshot {
  const { gsm, umts, lte, nr, ...cell } = row;
  if (gsm !== null) return { ...cell, details: omitCellId(gsm) };
  if (umts !== null) return { ...cell, details: omitCellId(umts) };
  if (lte !== null) return { ...cell, details: omitCellId(lte) };
  if (nr !== null) return { ...cell, details: omitCellId(nr) };
  return { ...cell, details: null };
}

export async function loadCellSnapshots(tx: DbTx, cellIds: readonly number[]): Promise<Map<number, CellSnapshot>> {
  const uniqueIds = [...new Set(cellIds)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await tx.query.cells.findMany({
    where: { id: { in: uniqueIds } },
    with: { gsm: true, umts: true, lte: true, nr: true },
  });
  return new Map(rows.map((row) => [row.id, flattenCellRow(row)]));
}

export async function loadCellSnapshot(tx: DbTx, cellId: number): Promise<CellSnapshot | undefined> {
  return (await loadCellSnapshots(tx, [cellId])).get(cellId);
}

export async function loadSectorSnapshot(tx: DbTx, stationId: number): Promise<SectorSnapshot[]> {
  return tx
    .select({ id: stationSectors.id, azimuth: stationSectors.azimuth })
    .from(stationSectors)
    .where(eq(stationSectors.station_id, stationId))
    .orderBy(asc(stationSectors.id));
}

export async function loadPhotoSelectionSnapshots(tx: DbTx, stationIds: readonly number[]): Promise<PhotoSelectionSnapshots> {
  const uniqueIds = [...new Set(stationIds)];
  const snapshots: PhotoSelectionSnapshots = new Map(uniqueIds.map((stationId) => [stationId, []]));
  if (uniqueIds.length === 0) return snapshots;

  const rows = await tx
    .select({
      station_id: stationPhotoSelections.station_id,
      location_photo_id: stationPhotoSelections.location_photo_id,
      is_main: stationPhotoSelections.is_main,
    })
    .from(stationPhotoSelections)
    .where(inArray(stationPhotoSelections.station_id, uniqueIds))
    .orderBy(asc(stationPhotoSelections.id));
  for (const row of rows) snapshots.get(row.station_id)?.push({ location_photo_id: row.location_photo_id, is_main: row.is_main });
  return snapshots;
}

function selectionsChanged(previous: readonly PhotoSelectionSnapshot[], next: readonly PhotoSelectionSnapshot[]): boolean {
  if (previous.length !== next.length) return true;
  const nextByPhotoId = new Map(next.map((selection) => [selection.location_photo_id, selection.is_main]));
  return previous.some((selection) => nextByPhotoId.get(selection.location_photo_id) !== selection.is_main);
}

export async function logPhotoSelectionChanges(audit: AuditRecorder, previous: PhotoSelectionSnapshots, metadata?: AuditMetadata): Promise<void> {
  const stationIds = [...previous.keys()];
  const next = await loadPhotoSelectionSnapshots(audit.tx, stationIds);
  await audit.logMany(
    stationIds.flatMap((stationId) => {
      const oldValues = previous.get(stationId) ?? [];
      const newValues = next.get(stationId) ?? [];
      if (!selectionsChanged(oldValues, newValues)) return [];
      return [
        {
          entity: "station_photo_selections" as const,
          op: "update" as const,
          recordId: null,
          stationId,
          old: oldValues,
          new: newValues,
          metadata,
        },
      ];
    }),
  );
}
