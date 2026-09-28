import {
  cells,
  gsmCells,
  lteCells,
  nrCells,
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
  stationPhotoSelections,
  stationSectors,
  submissions,
  umtsCells,
} from "@openbts/drizzle";
import { asc, eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../types/global.js";
import type { AuditMetadata, AuditRecorder } from "./types.js";

type CellWithRatRows = typeof cells.$inferSelect & {
  gsm: typeof gsmCells.$inferSelect | null;
  umts: typeof umtsCells.$inferSelect | null;
  lte: typeof lteCells.$inferSelect | null;
  nr: typeof nrCells.$inferSelect | null;
};

type ProposedCellWithRatRows = typeof proposedCells.$inferSelect & {
  gsm: typeof proposedGSMCells.$inferSelect | null;
  umts: typeof proposedUMTSCells.$inferSelect | null;
  lte: typeof proposedLTECells.$inferSelect | null;
  nr: typeof proposedNRCells.$inferSelect | null;
};

type SubmissionDraftRow = typeof submissions.$inferSelect & {
  proposedStation: typeof proposedStations.$inferSelect | null;
  proposedLocation: typeof proposedLocations.$inferSelect | null;
  proposedSectors: (typeof proposedSectors.$inferSelect)[];
  proposedCells: ProposedCellWithRatRows[];
};

type RatSnapshot =
  | Omit<typeof gsmCells.$inferSelect, "cell_id">
  | Omit<typeof umtsCells.$inferSelect, "cell_id">
  | Omit<typeof lteCells.$inferSelect, "cell_id">
  | Omit<typeof nrCells.$inferSelect, "cell_id">;

type ProposedRatSnapshot =
  | Omit<typeof proposedGSMCells.$inferSelect, "proposed_cell_id">
  | Omit<typeof proposedUMTSCells.$inferSelect, "proposed_cell_id">
  | Omit<typeof proposedLTECells.$inferSelect, "proposed_cell_id">
  | Omit<typeof proposedNRCells.$inferSelect, "proposed_cell_id">;

type StableProposalRow<T> = Omit<T, "id" | "submission_id" | "createdAt" | "updatedAt">;

export type CellSnapshot = typeof cells.$inferSelect & { details: RatSnapshot | null };
export type SectorSnapshot = { id: number; azimuth: number };
export type PhotoSelectionSnapshot = { location_photo_id: number; is_main: boolean };
export type PhotoSelectionSnapshots = Map<number, PhotoSelectionSnapshot[]>;
export type SubmissionDraftSnapshot = typeof submissions.$inferSelect & {
  proposedStation: StableProposalRow<typeof proposedStations.$inferSelect> | null;
  proposedLocation: StableProposalRow<typeof proposedLocations.$inferSelect> | null;
  sectors: StableProposalRow<typeof proposedSectors.$inferSelect>[];
  cells: Array<StableProposalRow<typeof proposedCells.$inferSelect> & { details: ProposedRatSnapshot | null }>;
};

function omitCellId<T extends { cell_id: number }>(row: T): Omit<T, "cell_id"> {
  const { cell_id: _cellId, ...details } = row;
  return details;
}

function omitProposedCellId<T extends { proposed_cell_id: number }>(row: T): Omit<T, "proposed_cell_id"> {
  const { proposed_cell_id: _proposedCellId, ...details } = row;
  return details;
}

function omitProposalMetadata<T extends { id: number; submission_id: string | null; createdAt: Date; updatedAt: Date }>(
  row: T,
): StableProposalRow<T> {
  const { id: _id, submission_id: _submissionId, createdAt: _createdAt, updatedAt: _updatedAt, ...snapshot } = row;
  return snapshot;
}

function compareSnapshotValues(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function flattenProposedCellRow(row: ProposedCellWithRatRows): SubmissionDraftSnapshot["cells"][number] {
  const { gsm, umts, lte, nr, ...cell } = row;
  const snapshot = omitProposalMetadata(cell);
  if (gsm !== null) return { ...snapshot, details: omitProposedCellId(gsm) };
  if (umts !== null) return { ...snapshot, details: omitProposedCellId(umts) };
  if (lte !== null) return { ...snapshot, details: omitProposedCellId(lte) };
  if (nr !== null) return { ...snapshot, details: omitProposedCellId(nr) };
  return { ...snapshot, details: null };
}

export function normalizeSubmissionDraft(row: SubmissionDraftRow): SubmissionDraftSnapshot {
  const { proposedStation, proposedLocation, proposedSectors: sectorRows, proposedCells: cellRows, ...submission } = row;
  const sectors = sectorRows.map(omitProposalMetadata).sort(compareSnapshotValues);
  const cells = cellRows.map(flattenProposedCellRow).sort(compareSnapshotValues);
  return {
    ...submission,
    proposedStation: proposedStation === null ? null : omitProposalMetadata(proposedStation),
    proposedLocation: proposedLocation === null ? null : omitProposalMetadata(proposedLocation),
    sectors,
    cells,
  };
}

export async function loadSubmissionDraftSnapshot(tx: DbTx, submissionId: string): Promise<SubmissionDraftSnapshot | undefined> {
  const row = await tx.query.submissions.findFirst({
    where: { id: submissionId },
    with: {
      proposedStation: true,
      proposedLocation: true,
      proposedSectors: true,
      proposedCells: { with: { gsm: true, umts: true, lte: true, nr: true } },
    },
  });
  return row === undefined ? undefined : normalizeSubmissionDraft(row);
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
