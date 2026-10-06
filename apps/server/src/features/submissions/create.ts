import {
  locationPhotos,
  proposedCells,
  proposedLocations,
  proposedSectors,
  proposedStations,
  stationPhotoSelections,
  submissionLocationPhotoSelections,
  submissions,
} from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { and, count, eq, inArray } from "drizzle-orm/sql";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import z from "zod";

import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";
import { validateCellBandsInCountry } from "../cells/arfcnValidation.js";
import { checkCellDuplicatesBatch, checkLTEClidConsistency, checkPciDuplicates } from "../cells/duplicateCheck.js";
import { NORMAL_RATS } from "../cells/ratCellPersistence.js";
import { assertCellUpdateFitsStoredRat, refuseNsaFields } from "../cells/ratCellSchemas.js";
import { findPlacementCountryCode } from "../stations/country.js";
import type { StationStatus } from "../stations/status.js";
import { uplinkSpeedSchema } from "../stations/uplink.js";
import {
  type ProposedLocationChanges,
  type ProposedStationChanges,
  changedLocationFields,
  changedStationFields,
  gsmInsertSchema,
  insertProposedCellDetails,
  isCompleteLocation,
  isNonEmpty,
  locationUpdateDiffers,
  lteInsertSchema,
  makeDetailsRatRefine,
  normalizeText,
  nrInsertSchemaBase,
  stampSubmissionCountry,
  stationUpdateDiffers,
  stripUnchangedProposalData,
  umtsInsertSchema,
  validateCellDuplicates,
  validateSectorChanges,
} from "./helpers.js";

export const submissionsSelectSchema = createSelectSchema(submissions);
export const submissionsInsertBase = createInsertSchema(submissions).omit({ createdAt: true, updatedAt: true, submitter_id: true });
const proposedStationInsert = createInsertSchema(proposedStations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, changed_fields: true })
  .extend({ uplink_speed: uplinkSpeedSchema.nullable().optional() })
  .strict();
const proposedLocationInsertBase = createInsertSchema(proposedLocations).omit({
  createdAt: true,
  updatedAt: true,
  submission_id: true,
  changed_fields: true,
});

export function refuseGenericAddress(location: { address?: string | null }, ctx: z.RefinementCtx): void {
  if (hasGenericAddressMarker(location.address)) {
    ctx.addIssue({ code: "custom", message: "Address must not contain variants of własny", path: ["address"] });
  }
}

export const proposedLocationInsert = proposedLocationInsertBase.strict().superRefine(refuseGenericAddress);
export const nrInsertSchema = nrInsertSchemaBase.superRefine(refuseNsaFields);
export const proposedSectorInsert = createInsertSchema(proposedSectors).omit({ createdAt: true, updatedAt: true, submission_id: true }).strict();
const proposedCellInsertBase = createInsertSchema(proposedCells)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, is_confirmed: true, operation: true })
  .extend({
    rat: z.enum(NORMAL_RATS).nullable().optional(),
    operation: z.enum(["add", "update", "delete"]).optional(),
    details: z.unknown().optional(),
  })
  .strict();
const proposedCellInsert = proposedCellInsertBase.superRefine(
  makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchema }),
);

const singleSubmissionSchema = z
  .object({
    station_id: submissionsInsertBase.shape.station_id.optional(),
    type: submissionsInsertBase.shape.type.optional(),
    origin: submissionsInsertBase.shape.origin.optional(),
    submitter_note: z.string().optional(),
    station: proposedStationInsert.optional(),
    location: proposedLocationInsert.optional(),
    sectors: z.array(proposedSectorInsert).optional(),
    cells: z.array(proposedCellInsert).optional(),
    pending_photos: z.number().int().min(1).optional(),
    location_photo_ids: z.array(z.number().int()).max(50).optional(),
    location_photo_ids_to_remove: z.array(z.number().int()).max(50).optional(),
    main_location_photo_id: z.number().int().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.main_location_photo_id !== undefined) {
      if (!data.location_photo_ids || !data.location_photo_ids.includes(data.main_location_photo_id))
        ctx.addIssue({ code: "custom", message: "main_location_photo_id must be one of the location_photo_ids" });
    }
    const locationPhotoIds = new Set(data.location_photo_ids ?? []);
    if ((data.location_photo_ids_to_remove ?? []).some((id) => locationPhotoIds.has(id)))
      ctx.addIssue({ code: "custom", message: "location_photo_ids and location_photo_ids_to_remove must not overlap" });
  });

export type SingleSubmission = z.infer<typeof singleSubmissionSchema>;
export type ChangeCell = NonNullable<SingleSubmission["cells"]>[number] & {
  is_confirmed?: boolean;
  destination_station_id?: number;
};
export type SubmissionChange = Omit<SingleSubmission, "location" | "cells"> & {
  location?: SingleSubmission["location"] | null;
  cells?: ChangeCell[];
  station_status?: StationStatus;
  station_is_confirmed?: boolean;
};
export type SubmissionWithExtras = z.infer<typeof submissionsSelectSchema> & {
  proposedStation?: z.infer<typeof proposedStationInsert>;
  proposedLocation?: z.infer<typeof proposedLocationInsert>;
  sectors?: z.infer<typeof proposedSectorInsert>[];
  cells?: z.infer<typeof proposedCellInsert>[];
};

function hasEditorFields(change: SubmissionChange): boolean {
  if (change.station_status !== undefined || change.station_is_confirmed !== undefined || change.location === null) return true;
  return (change.cells ?? []).some((cell) => cell.is_confirmed !== undefined || cell.destination_station_id !== undefined);
}

function hasSentFields(part: object | null | undefined): boolean {
  return Object.values(part ?? {}).some((value) => value !== undefined);
}

export function hasMeaningfulChanges(input: SubmissionChange): boolean {
  if (input.type === "delete" || hasEditorFields(input)) return true;
  if (input.type === "update" && (hasSentFields(input.station) || hasSentFields(input.location))) return true;
  const { station_id: _stationId, type: _type, origin: _origin, ...payload } = input;
  return isNonEmpty(payload);
}

export async function assertTargetCellsFit(
  cells: readonly Pick<ChangeCell, "operation" | "target_cell_id" | "rat">[],
  stationId: number | null,
): Promise<void> {
  const targetingCells = cells.filter((cell) => cell.operation === "update" || cell.operation === "delete");
  const targetCellIds = unique(targetingCells.map((cell) => cell.target_cell_id));
  if (targetCellIds.length === 0) return;

  const targetCells = await db.query.cells.findMany({ where: { id: { in: targetCellIds } }, columns: { id: true, rat: true, station_id: true } });
  const targetCellById = new Map(targetCells.map((cell) => [cell.id, cell]));
  for (const { operation, target_cell_id: targetCellId, rat } of targetingCells) {
    if (typeof targetCellId !== "number") continue;

    const targetCell = targetCellById.get(targetCellId);
    if (!targetCell || targetCell.station_id !== stationId) {
      throw new ErrorResponse("NOT_FOUND", { message: `Cell ${targetCellId} does not exist on this station` });
    }
    if (operation === "update") assertCellUpdateFitsStoredRat(targetCell, { rat: rat ?? undefined });
  }
}

export function validateSubmission(input: SingleSubmission): Promise<void> {
  return validateChange(input, "review");
}

export async function validateChange(input: SubmissionChange, handling: "review" | "direct"): Promise<void> {
  const { station_id, type, station: stationData } = input;
  const locationData = input.location ?? undefined;
  const waitsForReview = handling === "review";

  const isNewStation = (type ?? "new") === "new";
  const createsPendingStation = isNewStation && (input.cells?.length ?? 0) === 0;
  if (waitsForReview && createsPendingStation && input.pending_photos === undefined) {
    throw new ErrorResponse("BAD_REQUEST", { message: "At least one photo is required when submitting a new station without cells" });
  }

  if (isNewStation && !stationData?.station_id?.trim()) throw new ErrorResponse("BAD_REQUEST", { message: "A new station needs a station ID" });
  if (isNewStation && stationData && typeof stationData.operator_id !== "number")
    throw new ErrorResponse("BAD_REQUEST", { message: "operator_id is required for new stations" });
  if (isNewStation && stationData && !stationData.uplink_type && typeof stationData.uplink_speed === "number") {
    throw new ErrorResponse("BAD_REQUEST", { message: "A new station's uplink speed needs an uplink type" });
  }
  if (isNewStation && locationData && !isCompleteLocation(locationData))
    throw new ErrorResponse("BAD_REQUEST", { message: "A region and coordinates are required for a new station's location" });

  if ((type === "update" || type === "delete") && !station_id)
    throw new ErrorResponse("INVALID_QUERY", { message: "station_id is required for update and delete submissions" });
  if (type === "delete" && ((input.cells?.length ?? 0) > 0 || (input.sectors?.length ?? 0) > 0)) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A delete cannot carry cell or sector changes" });
  }

  const stationId = station_id !== undefined ? Number(station_id) : null;
  if (stationId !== null && Number.isNaN(stationId)) throw new ErrorResponse("INVALID_QUERY");

  const [targetStation, duplicateStation, existingLocation, targetExtraIdentifier, targetUplink] = await Promise.all([
    stationId !== null
      ? db.query.stations.findFirst({
          where: { id: stationId },
          with: {
            location: true,
            sectors: { columns: { id: true, azimuth: true } },
          },
        })
      : null,

    type === "new" && stationData?.station_id && typeof stationData.operator_id === "number"
      ? db.query.stations.findFirst({
          where: {
            station_id: stationData.station_id,
            operator_id: stationData.operator_id,
          },
        })
      : null,

    type === "new" && stationData?.station_id && typeof locationData?.latitude === "number" && typeof locationData.longitude === "number"
      ? db.query.locations.findFirst({
          with: {
            stations: {
              where: {
                station_id: stationData.station_id,
              },
            },
          },
          where: {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
          },
        })
      : null,

    type === "update" && stationId !== null ? db.query.extraIdentificators.findFirst({ where: { station_id: stationId } }) : null,
    type === "update" && stationId !== null ? db.query.stationUplinks.findFirst({ where: { station_id: stationId } }) : null,
  ]);

  if (stationId !== null && !targetStation) throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });
  if (waitsForReview && stationId !== null && targetStation && targetStation.status !== "published" && targetStation.status !== "pending") {
    throw new ErrorResponse("NOT_FOUND", { message: "Station not found" });
  }
  if (type === "update" && locationData && !targetStation?.location && !isCompleteLocation(locationData))
    throw new ErrorResponse("BAD_REQUEST", { message: "A region and coordinates are required when the station has no location" });
  const sectorChanges = validateSectorChanges(input.sectors, targetStation?.sectors ?? [], input.cells);

  if (duplicateStation) {
    throw new ErrorResponse("BAD_REQUEST", {
      message: "A station with this station ID and operator already exists; update that station instead",
    });
  }

  if (type === "new" && existingLocation && existingLocation.stations && existingLocation.stations.length > 0)
    throw new ErrorResponse("BAD_REQUEST", { message: "The station is already registered at this location" });

  const operatorId = type === "new" ? stationData?.operator_id : targetStation?.operator_id;

  const allModifiedCellIds = input.cells?.map((c) => c.target_cell_id).filter((id): id is number => id !== null && id !== undefined) ?? [];
  if (input.cells && input.cells.length > 0) {
    await assertTargetCellsFit(input.cells, isNewStation ? null : stationId);
    validateCellDuplicates(input.cells);
    if (unique(allModifiedCellIds).length !== allModifiedCellIds.length) {
      throw new ErrorResponse("BAD_REQUEST", { message: "A cell can be changed once per submission" });
    }
    // await checkLTEClidConsistency(
    //   stationId,
    //   input.cells
    //     .filter((cell) => cell.operation !== "delete")
    //     .map((cell) => ({
    //       rat: cell.rat,
    //       details: cell.details as Record<string, unknown> | undefined,
    //       excludeCellId: cell.target_cell_id ?? undefined,
    //     })),
    //   input.cells.map((c) => c.target_cell_id).filter((id): id is number => id !== null && id !== undefined),
    //   operatorId,
    // );
    const countryCode = await findPlacementCountryCode({ stationId, regionId: locationData?.region_id, operatorId: stationData?.operator_id });
    await validateCellBandsInCountry(
      input.cells.filter((cell) => cell.operation !== "delete"),
      countryCode,
    );
  }

  if (type === "update" && input.location_photo_ids && input.location_photo_ids.length > 0) {
    if (!targetStation?.location?.id)
      throw new ErrorResponse("BAD_REQUEST", { message: "Cannot validate location_photo_ids: station has no location" });
    const [countRow] = await db
      .select({ value: count() })
      .from(locationPhotos)
      .where(and(inArray(locationPhotos.id, input.location_photo_ids), eq(locationPhotos.location_id, targetStation.location.id)));
    if ((countRow?.value ?? 0) !== input.location_photo_ids.length)
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more location_photo_ids are invalid or do not belong to this station's location" });
  }

  const locationPhotoIdsToRemove = input.location_photo_ids_to_remove ?? [];
  if (locationPhotoIdsToRemove.length > 0) {
    if (type !== "update")
      throw new ErrorResponse("BAD_REQUEST", { message: "location_photo_ids_to_remove is only supported for update submissions" });
    if (stationId === null) throw new ErrorResponse("BAD_REQUEST", { message: "Cannot validate location_photo_ids_to_remove without a station" });
    const [countRow] = await db
      .select({ value: count() })
      .from(stationPhotoSelections)
      .where(and(eq(stationPhotoSelections.station_id, stationId), inArray(stationPhotoSelections.location_photo_id, locationPhotoIdsToRemove)));
    if ((countRow?.value ?? 0) !== locationPhotoIdsToRemove.length)
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more location_photo_ids_to_remove are not assigned to this station" });
  }

  if (operatorId && input.cells && input.cells.length > 0) {
    const dupEntries = input.cells
      .filter((cell) => cell.details && cell.operation !== "delete" && cell.destination_station_id === undefined)
      .map((cell) => ({ rat: cell.rat!, details: cell.details as Record<string, unknown>, excludeCellId: cell.target_cell_id ?? undefined }));
    if (dupEntries.length > 0) await checkCellDuplicatesBatch(dupEntries, operatorId, allModifiedCellIds);
  }

  if (stationId !== null && input.cells && input.cells.length > 0) {
    await checkPciDuplicates(
      stationId,
      input.cells
        .filter((cell) => cell.operation !== "delete")
        .map((cell) => ({
          rat: cell.rat,
          bandId: cell.band_id,
          details: cell.details as { pci?: number | null; earfcn?: number | null; arfcn?: number | null } | undefined,
          excludeCellId: cell.target_cell_id ?? undefined,
        })),
      allModifiedCellIds,
    );
  }

  if (waitsForReview && type === "update" && targetStation) {
    const hasStationChanges = !!stationData && stationUpdateDiffers(stationData, targetStation, targetExtraIdentifier ?? null, targetUplink ?? null);

    const currentLocation = targetStation.location;
    const hasLocationChanges = !!locationData && (!currentLocation || locationUpdateDiffers(locationData, currentLocation));

    const hasCellChanges = input.cells && input.cells.length > 0;
    const hasSectorChanges = sectorChanges.length > 0;

    const hasPendingPhotos = !!input.pending_photos;
    const hasLocationPhotoSelections = (input.location_photo_ids?.length ?? 0) > 0;
    const hasLocationPhotoRemovals = (input.location_photo_ids_to_remove?.length ?? 0) > 0;
    if (
      !hasStationChanges &&
      !hasLocationChanges &&
      !hasCellChanges &&
      !hasSectorChanges &&
      !hasPendingPhotos &&
      !hasLocationPhotoSelections &&
      !hasLocationPhotoRemovals
    )
      throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected. Please modify the data before submitting." });
  }
}

export type PhotoPickInput = Pick<SingleSubmission, "location_photo_ids" | "location_photo_ids_to_remove" | "main_location_photo_id">;

export async function insertPhotoPicks(tx: DbTx, submissionId: string, picks: PhotoPickInput): Promise<void> {
  if (picks.location_photo_ids && picks.location_photo_ids.length > 0) {
    await tx.insert(submissionLocationPhotoSelections).values(
      picks.location_photo_ids.map((photoId) => ({
        submission_id: submissionId,
        location_photo_id: photoId,
        is_main: photoId === picks.main_location_photo_id,
        is_removal: false,
      })),
    );
  }

  if (picks.location_photo_ids_to_remove && picks.location_photo_ids_to_remove.length > 0) {
    await tx.insert(submissionLocationPhotoSelections).values(
      picks.location_photo_ids_to_remove.map((photoId) => ({
        submission_id: submissionId,
        location_photo_id: photoId,
        is_main: false,
        is_removal: true,
      })),
    );
  }
}

export async function processSubmission(tx: DbTx, input: SingleSubmission, userId: string): Promise<SubmissionWithExtras> {
  const { station_id, type, submitter_note, station: stationData, location: locationData, sectors, cells: proposedCellsInput } = input;

  if (!hasMeaningfulChanges(input))
    throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected. Please modify the data before submitting." });

  let stationDataToStore: ProposedStationChanges | undefined = stationData;
  let locationDataToStore: ProposedLocationChanges | undefined = locationData;
  const isStationUpdate = type === "update" && station_id !== undefined && station_id !== null;
  if (isStationUpdate) {
    const resolved = await stripUnchangedProposalData(tx, Number(station_id), stationData, locationData);
    stationDataToStore = resolved.stationData;
    locationDataToStore = resolved.locationData;
  }

  const [submission] = await tx
    .insert(submissions)
    .values({
      submitter_id: userId,
      station_id: station_id ?? null,
      type,
      origin: input.origin,
      submitter_note: submitter_note ?? null,
      pending_photos: input.pending_photos ?? null,
    })
    .returning();
  if (!submission) throw new ErrorResponse("FAILED_TO_CREATE");

  if (stationDataToStore)
    await tx.insert(proposedStations).values({
      ...stationDataToStore,
      notes: normalizeText(stationDataToStore.notes),
      changed_fields: isStationUpdate ? changedStationFields(stationDataToStore) : null,
      submission_id: submission.id,
      is_confirmed: false,
    });

  if (locationDataToStore)
    await tx.insert(proposedLocations).values({
      ...locationDataToStore,
      move: locationData?.move ?? "station",
      changed_fields: isStationUpdate ? changedLocationFields(locationDataToStore) : null,
      submission_id: submission.id,
    });

  if (sectors && sectors.length > 0) await tx.insert(proposedSectors).values(sectors.map((sector) => ({ ...sector, submission_id: submission.id })));

  await insertPhotoPicks(tx, submission.id, input);

  if (proposedCellsInput && proposedCellsInput.length > 0) {
    /* eslint-disable no-await-in-loop */
    for (const cell of proposedCellsInput) {
      try {
        const [base] = await tx
          .insert(proposedCells)
          .values({
            submission_id: submission.id,
            target_cell_id: cell.target_cell_id ?? null,
            station_id: cell.station_id ?? station_id ?? null,
            band_id: cell.band_id ?? null,
            target_sector_id: cell.target_sector_id ?? null,
            sector_local_id: cell.sector_local_id ?? null,
            sector_unassigned: cell.sector_unassigned ?? false,
            rat: cell.rat ?? null,
            type: cell.type ?? null,
            notes: cell.notes ?? null,
            is_confirmed: false,
            operation: cell.operation ?? "add",
          })
          .returning();
        if (!base) throw new ErrorResponse("FAILED_TO_CREATE");

        if (cell.operation !== "delete") {
          const targetCellId = cell.operation === "update" ? (cell.target_cell_id ?? null) : null;
          await insertProposedCellDetails(tx, cell.rat, cell.details as Record<string, unknown>, base.id, targetCellId);
        }
      } catch (error) {
        if (error instanceof ErrorResponse) throw error;
        throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  const countryCode = await stampSubmissionCountry(tx, submission.id);
  return {
    ...submission,
    country_code: countryCode,
    proposedStation: stationDataToStore,
    proposedLocation: locationDataToStore,
    sectors,
    cells: proposedCellsInput,
  };
}
