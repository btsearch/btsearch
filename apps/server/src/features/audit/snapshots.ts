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
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import type { DbTx } from "../../types/global.js";
import type { submissionsSelectSchema } from "../submissions/create.js";
import type {
  gsmSelectSchema,
  lteSelectSchema,
  nrSelectSchema,
  proposedCellsSelectSchema,
  proposedLocationsSelectSchema,
  proposedStationsSelectSchema,
  umtsSelectSchema,
} from "../submissions/helpers.js";
import type { AuditMetadata, AuditRecorder } from "./types.js";

const cellSelectSchema = createSelectSchema(cells);
const gsmCellSelectSchema = createSelectSchema(gsmCells);
const umtsCellSelectSchema = createSelectSchema(umtsCells);
const lteCellSelectSchema = createSelectSchema(lteCells);
const nrCellSelectSchema = createSelectSchema(nrCells);
const proposedGSMCellSelectSchema = createSelectSchema(proposedGSMCells);
const proposedUMTSCellSelectSchema = createSelectSchema(proposedUMTSCells);
const proposedLTECellSelectSchema = createSelectSchema(proposedLTECells);
const proposedNRCellSelectSchema = createSelectSchema(proposedNRCells);
const proposedSectorSelectSchema = createSelectSchema(proposedSectors);

type CellRow = z.infer<typeof cellSelectSchema>;
type GsmCellRow = z.infer<typeof gsmCellSelectSchema>;
type UmtsCellRow = z.infer<typeof umtsCellSelectSchema>;
type LteCellRow = z.infer<typeof lteCellSelectSchema>;
type NrCellRow = z.infer<typeof nrCellSelectSchema>;
type SubmissionRow = z.infer<typeof submissionsSelectSchema>;
type ProposedCellRow = z.infer<typeof proposedCellsSelectSchema>;
type ProposedStationRow = z.infer<typeof proposedStationsSelectSchema>;
type ProposedLocationRow = z.infer<typeof proposedLocationsSelectSchema>;
type ProposedSectorRow = z.infer<typeof proposedSectorSelectSchema>;

type CellWithRatRows = CellRow & {
  gsm: GsmCellRow | null;
  umts: UmtsCellRow | null;
  lte: LteCellRow | null;
  nr: NrCellRow | null;
};

type ProposedCellWithRatRows = ProposedCellRow & {
  gsm: z.infer<typeof proposedGSMCellSelectSchema> | null;
  umts: z.infer<typeof proposedUMTSCellSelectSchema> | null;
  lte: z.infer<typeof proposedLTECellSelectSchema> | null;
  nr: z.infer<typeof proposedNRCellSelectSchema> | null;
};

type SubmissionDraftRow = SubmissionRow & {
  proposedStation: ProposedStationRow | null;
  proposedLocation: ProposedLocationRow | null;
  proposedSectors: ProposedSectorRow[];
  proposedCells: ProposedCellWithRatRows[];
};

type RatSnapshot = Omit<GsmCellRow, "cell_id"> | Omit<UmtsCellRow, "cell_id"> | Omit<LteCellRow, "cell_id"> | Omit<NrCellRow, "cell_id">;

type ProposedRatSnapshot =
  | z.infer<typeof gsmSelectSchema>
  | z.infer<typeof umtsSelectSchema>
  | z.infer<typeof lteSelectSchema>
  | z.infer<typeof nrSelectSchema>;

type StableProposalRow<T> = Omit<T, "id" | "submission_id" | "createdAt" | "updatedAt">;

export type CellSnapshot = CellRow & { details: RatSnapshot | null };
export type SectorSnapshot = { id: number; azimuth: number };
export type PhotoSelectionSnapshot = { location_photo_id: number; is_main: boolean };
export type PhotoSelectionSnapshots = Map<number, PhotoSelectionSnapshot[]>;
export type SubmissionDraftSnapshot = SubmissionRow & {
  proposedStation: StableProposalRow<ProposedStationRow> | null;
  proposedLocation: StableProposalRow<ProposedLocationRow> | null;
  sectors: StableProposalRow<ProposedSectorRow>[];
  cells: (StableProposalRow<ProposedCellRow> & { details: ProposedRatSnapshot | null })[];
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
