import {
  attachments,
  cells,
  locationPhotos,
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
  stations,
  submissionLocationPhotoSelections,
  submissionPhotos,
  users,
} from "@openbts/drizzle";
import type {
  CellChange,
  CountryFeatures,
  LocationChange,
  SectorChange,
  StationChange,
  Submission,
  SubmissionChanges,
  SubmissionInclude,
  SubmissionStatus,
} from "@openbts/shared/contract";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { loadUnknownBandIds } from "../bands/unknown.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { type PhotoRow, photoColumns, photoUrls, toPhotoDetails } from "../photos/read.js";
import { disabledCountryFeatures, getCountryFeaturesByCode } from "../stations/countryFeatures.js";
import { serializeStations, stationAreaConditions } from "../stations/read.js";
import { CELL_TYPES, CONTRACT_RATS, type StationRow, toAzimuth } from "../stations/serialize.js";
import { toStructureType } from "../structures/serialize.js";
import { type UserRefViewer, loadUserRefViewer, toPublicUserRef } from "../users/userRef.js";
import {
  type ProposedLocationChanges,
  type ProposedLocationRow,
  type ProposedStationChanges,
  type ProposedStationRow,
  getProposedLocationChanges,
  getProposedStationChanges,
  type gsmSelectSchema,
  type lteSelectSchema,
  normalizeText,
  type nrSelectSchema,
  type proposedCellsSelectSchema,
  type umtsSelectSchema,
} from "./helpers.js";
import type { SubmissionRow } from "./read.js";

const proposedSectorSelectSchema = createSelectSchema(proposedSectors);

export type ProposedSectorRow = z.infer<typeof proposedSectorSelectSchema>;
type ProposedCellRows = {
  cell: z.infer<typeof proposedCellsSelectSchema>;
  gsm: z.infer<typeof gsmSelectSchema> | null;
  umts: z.infer<typeof umtsSelectSchema> | null;
  lte: z.infer<typeof lteSelectSchema> | null;
  nr: z.infer<typeof nrSelectSchema> | null;
};
type PhotoPickRow = PhotoRow & { submissionId: string; isMain: boolean; isRemoval: boolean };
type PickedPhoto = SubmissionChanges["photos"]["removed"][number];

const TYPE_ACTIONS = { new: "create", update: "update", delete: "delete" } as const;
const OPERATION_ACTIONS = { add: "create", update: "update", delete: "delete" } as const;
const STATUSES = { pending: "pending", approved: "accepted", rejected: "rejected" } as const;

export const DATABASE_SUBMISSION_STATUSES: Record<SubmissionStatus, SubmissionRow["status"]> = {
  pending: "pending",
  accepted: "approved",
  rejected: "rejected",
};

function toBackhaulChange(changes: ProposedStationChanges): StationChange["backhaul"] {
  if (changes.uplink_type === null) return null;

  const backhaul: NonNullable<StationChange["backhaul"]> = {};
  if (changes.uplink_type !== undefined) backhaul.medium = changes.uplink_type;
  if (changes.uplink_speed !== undefined) backhaul.speedMbps = changes.uplink_speed;
  if (changes.uplink_model !== undefined) backhaul.model = changes.uplink_model;
  return backhaul;
}

function toStationChange(row: ProposedStationRow): StationChange {
  const changes = getProposedStationChanges(row);
  const station: StationChange = {};
  if (typeof changes.station_id === "string") station.siteId = changes.station_id;
  if (typeof changes.operator_id === "number") station.operatorId = changes.operator_id;
  if (changes.notes !== undefined) station.notes = changes.notes;

  const identifiers: NonNullable<StationChange["identifiers"]> = [];
  if (changes.networks_id !== undefined) identifiers.push({ kind: "networksId", value: changes.networks_id?.toString() ?? null });
  if (changes.networks_name !== undefined) identifiers.push({ kind: "networksName", value: changes.networks_name });
  if (changes.mno_name !== undefined) identifiers.push({ kind: "operatorName", value: changes.mno_name });
  if (identifiers.length > 0) station.identifiers = identifiers;

  if (changes.uplink_type !== undefined || changes.uplink_speed !== undefined || changes.uplink_model !== undefined) {
    station.backhaul = toBackhaulChange(changes);
  }
  return station;
}

function toProposedStructure(changes: ProposedLocationChanges): LocationChange["structure"] {
  const { structure_type: type, structure_owner_id: ownerId, structure_owner_name: ownerName, structure_note: note } = changes;
  if (type === undefined && ownerId === undefined && note === undefined) return undefined;

  const structure: NonNullable<LocationChange["structure"]> = {};
  if (type !== undefined) structure.type = type === null ? null : toStructureType(type);
  if (ownerId !== undefined) {
    structure.ownerId = ownerId;
    structure.ownerName = ownerName ?? null;
  }
  if (note !== undefined) structure.note = note;
  return structure;
}

function toLocationChange(row: ProposedLocationRow): LocationChange {
  const changes = getProposedLocationChanges(row);
  const structure = toProposedStructure(changes);
  const location: Omit<LocationChange, "move"> = {};
  if (typeof changes.region_id === "number") location.regionId = changes.region_id;
  if (changes.city !== undefined) location.city = changes.city;
  if (changes.address !== undefined) location.address = changes.address;
  if (structure !== undefined) location.structure = structure;
  if (typeof changes.latitude === "number") location.latitude = changes.latitude;
  if (typeof changes.longitude === "number") location.longitude = changes.longitude;
  return { ...location, move: row.move };
}

function toSectorChange(row: ProposedSectorRow): SectorChange {
  return {
    action: row.operation === null ? null : OPERATION_ACTIONS[row.operation],
    id: row.target_sector_id,
    key: row.local_id,
    azimuth: toAzimuth(row.azimuth),
  };
}

function toRadioFields({ gsm, umts, lte, nr }: ProposedCellRows, features: Readonly<CountryFeatures>): Partial<CellChange> {
  if (gsm) return { lac: gsm.lac, cid: gsm.cid, isEGsm: gsm.e_gsm ?? false, bsic: features.bsic ? gsm.bsic : null };

  if (umts) {
    const rnc = umts.rnc === 0 ? null : umts.rnc;
    const cid = rnc === null && umts.cid === 0 ? null : umts.cid;
    return { lac: umts.lac, rnc, cid, psc: features.psc ? umts.psc : null, uarfcn: umts.arfcn };
  }

  if (lte) {
    const enbid = lte.enbid === 0 ? null : lte.enbid;
    return {
      tac: lte.tac,
      enbid,
      clid: enbid === null && lte.clid === 0 ? null : lte.clid,
      pci: lte.pci,
      earfcn: lte.earfcn,
      supportsIot: lte.supports_iot ?? false,
    };
  }

  if (nr) {
    return {
      mode: nr.type,
      tac: nr.nrtac,
      gnbid: nr.gnbid === 0 ? null : nr.gnbid,
      gnbidLength: nr.gnbid_length,
      clid: nr.clid,
      pci: nr.pci,
      arfcn: nr.arfcn,
      supportsRedCap: nr.supports_nr_redcap ?? false,
    };
  }

  return {};
}

function keepsLiveNotes(cell: ProposedCellRows["cell"]): boolean {
  return cell.operation === "update" && cell.notes === null;
}

function toCellChange(
  rows: ProposedCellRows,
  liveNotes: ReadonlyMap<number, string | null>,
  unknownBandIds: ReadonlySet<number>,
  features: Readonly<CountryFeatures>,
): CellChange {
  const { cell } = rows;
  const notes = keepsLiveNotes(cell) && cell.target_cell_id !== null ? (liveNotes.get(cell.target_cell_id) ?? null) : normalizeText(cell.notes);

  return {
    changeId: cell.id,
    action: OPERATION_ACTIONS[cell.operation],
    id: cell.target_cell_id,
    rat: cell.rat === null ? null : (CONTRACT_RATS[cell.rat] ?? null),
    bandId: cell.band_id !== null && unknownBandIds.has(cell.band_id) ? null : cell.band_id,
    sectorId: cell.target_sector_id,
    sectorKey: cell.sector_local_id,
    isSectorCleared: cell.sector_unassigned,
    cellType: cell.type === null ? null : CELL_TYPES[cell.type],
    notes,
    isConfirmed: cell.is_confirmed,
    ...toRadioFields(rows, features),
  };
}

function toPickedPhoto(pick: PhotoPickRow, viewer: UserRefViewer): PickedPhoto {
  return { id: pick.fileId, urls: photoUrls(pick.fileId, pick.hasThumb, pick.hasFull), ...toPhotoDetails(pick, viewer) };
}

function toPhotoChanges(
  row: SubmissionRow,
  uploadedCount: number,
  picks: readonly PhotoPickRow[],
  viewer: UserRefViewer,
): SubmissionChanges["photos"] {
  return {
    announcedCount: row.pending_photos ?? 0,
    uploadedCount,
    selected: picks.filter((pick) => !pick.isRemoval).map((pick) => ({ ...toPickedPhoto(pick, viewer), isMain: pick.isMain })),
    removed: picks.filter((pick) => pick.isRemoval).map((pick) => toPickedPhoto(pick, viewer)),
  };
}

async function loadVisibleStations(req: FastifyRequest, stationIds: number[]): Promise<StationRow[]> {
  if (stationIds.length === 0) return [];

  return db
    .select()
    .from(stations)
    .where(and(inArray(stations.id, stationIds), ...stationAreaConditions({}, await loadHiddenCountryCodes(req))));
}

async function loadLiveNotes(cellRows: readonly ProposedCellRows[]): Promise<Map<number, string | null>> {
  const cellIds = cellRows.flatMap(({ cell }) => (keepsLiveNotes(cell) && cell.target_cell_id !== null ? [cell.target_cell_id] : []));
  if (cellIds.length === 0) return new Map();

  const rows = await db.select({ id: cells.id, notes: cells.notes }).from(cells).where(inArray(cells.id, cellIds));
  return new Map(rows.map((row) => [row.id, row.notes]));
}

export async function serializeSubmissions(
  req: FastifyRequest,
  rows: readonly SubmissionRow[],
  include: readonly SubmissionInclude[] = [],
): Promise<Submission[]> {
  if (rows.length === 0) return [];

  const submissionIds = rows.map((row) => row.id);
  const userIds = unique(rows.flatMap((row) => [row.submitter_id, row.reviewer_id]));
  const stationIds = unique(rows.map((row) => row.station_id));
  const wantsLocation = include.includes("station.location");
  const wantsStation = wantsLocation || include.includes("station");

  const [stationRows, locationRows, sectorRows, cellRows, pickRows, uploadRows, userRows, targetStationRows, viewer] = await Promise.all([
    db.select().from(proposedStations).where(inArray(proposedStations.submission_id, submissionIds)),
    db.select().from(proposedLocations).where(inArray(proposedLocations.submission_id, submissionIds)),
    db.select().from(proposedSectors).where(inArray(proposedSectors.submission_id, submissionIds)).orderBy(asc(proposedSectors.id)),
    db
      .select({ cell: proposedCells, gsm: proposedGSMCells, umts: proposedUMTSCells, lte: proposedLTECells, nr: proposedNRCells })
      .from(proposedCells)
      .leftJoin(proposedGSMCells, eq(proposedGSMCells.proposed_cell_id, proposedCells.id))
      .leftJoin(proposedUMTSCells, eq(proposedUMTSCells.proposed_cell_id, proposedCells.id))
      .leftJoin(proposedLTECells, eq(proposedLTECells.proposed_cell_id, proposedCells.id))
      .leftJoin(proposedNRCells, eq(proposedNRCells.proposed_cell_id, proposedCells.id))
      .where(inArray(proposedCells.submission_id, submissionIds))
      .orderBy(asc(proposedCells.id)),
    db
      .select({
        submissionId: submissionLocationPhotoSelections.submission_id,
        isMain: submissionLocationPhotoSelections.is_main,
        isRemoval: submissionLocationPhotoSelections.is_removal,
        ...photoColumns,
      })
      .from(submissionLocationPhotoSelections)
      .innerJoin(locationPhotos, eq(locationPhotos.id, submissionLocationPhotoSelections.location_photo_id))
      .innerJoin(attachments, eq(attachments.id, locationPhotos.attachment_id))
      .leftJoin(users, eq(users.id, locationPhotos.uploaded_by))
      .where(inArray(submissionLocationPhotoSelections.submission_id, submissionIds))
      .orderBy(asc(locationPhotos.id)),
    db
      .select({ submissionId: submissionPhotos.submission_id, total: count() })
      .from(submissionPhotos)
      .where(inArray(submissionPhotos.submission_id, submissionIds))
      .groupBy(submissionPhotos.submission_id),
    userIds.length > 0
      ? db
          .select({ id: users.id, username: users.username, name: users.name, image: users.image, profileVisibility: users.profileVisibility })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
    wantsStation ? loadVisibleStations(req, stationIds) : [],
    loadUserRefViewer(req),
  ]);
  const [liveNotes, unknownBandIds, featuresByCountry] = await Promise.all([
    loadLiveNotes(cellRows),
    cellRows.length > 0 ? loadUnknownBandIds() : new Set<number>(),
    getCountryFeaturesByCode(cellRows.length > 0 ? rows.map((row) => row.country_code) : []),
  ]);

  const stationBySubmission = new Map(stationRows.map((row) => [row.submission_id, row]));
  const locationBySubmission = new Map(locationRows.map((row) => [row.submission_id, row]));
  const sectorsBySubmission = Map.groupBy(sectorRows, (row) => row.submission_id);
  const cellsBySubmission = Map.groupBy(cellRows, (row) => row.cell.submission_id);
  const picksBySubmission = Map.groupBy(pickRows, (row) => row.submissionId);
  const uploadsBySubmission = new Map(uploadRows.map((row) => [row.submissionId, row.total]));
  const usersById = new Map(userRows.map((row) => [row.id, row]));
  const targetStations = await serializeStations(targetStationRows, wantsLocation ? ["location"] : []);
  const targetStationsById = new Map(targetStations.map((station) => [station.id, station]));

  return rows.map((row) => {
    const proposedStation = stationBySubmission.get(row.id);
    const proposedLocation = locationBySubmission.get(row.id);
    const submitter = row.submitter_id === null ? undefined : usersById.get(row.submitter_id);
    const reviewer = row.reviewer_id === null ? undefined : usersById.get(row.reviewer_id);
    const targetStation = row.station_id === null ? null : (targetStationsById.get(row.station_id) ?? null);
    const countryFeatures =
      row.country_code === null ? disabledCountryFeatures : (featuresByCountry.get(row.country_code) ?? disabledCountryFeatures);

    const submission: Submission = {
      id: row.id,
      action: TYPE_ACTIONS[row.type],
      status: STATUSES[row.status],
      origin: row.origin,
      stationId: row.station_id,
      countryCode: row.country_code,
      note: row.submitter_note,
      reviewNote: row.review_notes,
      submitter: submitter ? toPublicUserRef(submitter, viewer) : null,
      reviewer: reviewer ? toPublicUserRef(reviewer, viewer) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      changes: {
        station: proposedStation ? toStationChange(proposedStation) : null,
        location: proposedLocation ? toLocationChange(proposedLocation) : null,
        sectors: (sectorsBySubmission.get(row.id) ?? []).map(toSectorChange),
        cells: (cellsBySubmission.get(row.id) ?? []).map((cell) => toCellChange(cell, liveNotes, unknownBandIds, countryFeatures)),
        photos: toPhotoChanges(row, uploadsBySubmission.get(row.id) ?? 0, picksBySubmission.get(row.id) ?? [], viewer),
      },
    };
    if (wantsStation) submission.station = targetStation;
    return submission;
  });
}
