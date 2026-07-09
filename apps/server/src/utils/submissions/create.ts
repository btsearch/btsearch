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
import { isARFCNValidForBand } from "@openbts/shared/frequency";
import { and, count, eq, inArray } from "drizzle-orm/sql";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import z from "zod";

import { ErrorResponse } from "../../errors.ts";
import { checkCellDuplicatesBatch, checkLTEClidConsistency, checkPciDuplicates } from "../../services/cellDuplicateCheck.service.ts";
import type { DbTx } from "../../types/global.ts";
import { formatARFCNBandErrorMessage } from "../cellARFCNValidation.ts";
import {
  gsmInsertSchema,
  insertProposedCellDetails,
  isNonEmpty,
  lteInsertSchema,
  makeDetailsRatRefine,
  nrInsertSchemaBase,
  umtsInsertSchema,
  validateCellDuplicates,
} from "../submission.helpers.ts";

export const submissionsSelectSchema = createSelectSchema(submissions);
export const submissionsInsertBase = createInsertSchema(submissions).omit({ createdAt: true, updatedAt: true, submitter_id: true });
const MAX_SECTORS = 15;
export const proposedStationInsert = createInsertSchema(proposedStations).omit({ createdAt: true, updatedAt: true, submission_id: true }).strict();
export const proposedLocationInsert = createInsertSchema(proposedLocations)
  .omit({ createdAt: true, updatedAt: true, submission_id: true })
  .strict()
  .superRefine((data, ctx) => {
    if (hasGenericAddressMarker(data.address))
      ctx.addIssue({ code: "custom", message: "Address must not contain variants of własny", path: ["address"] });
  });
export const nrInsertSchema = nrInsertSchemaBase.superRefine((data, ctx) => {
  if (data.type === "nsa") {
    for (const field of ["nrtac", "clid", "gnbid"] as const) {
      if (data[field] !== null && data[field] !== undefined)
        ctx.addIssue({ code: "custom", message: `${field} must not be set for NSA NR cells`, path: [field] });
    }
    if (data.supports_nr_redcap === true) {
      ctx.addIssue({ code: "custom", message: "supports_nr_redcap must not be set for NSA NR cells", path: ["supports_nr_redcap"] });
    }
  }
});
export const proposedSectorInsert = createInsertSchema(proposedSectors).omit({ createdAt: true, updatedAt: true, submission_id: true }).strict();
export const proposedCellInsert = createInsertSchema(proposedCells)
  .omit({ createdAt: true, updatedAt: true, submission_id: true, is_confirmed: true, operation: true })
  .extend({
    operation: z.enum(["add", "update", "delete"]).optional(),
    details: z.unknown().optional(),
  })
  .strict()
  .superRefine(makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchema }));

export const singleSubmissionSchema = z
  .object({
    station_id: submissionsInsertBase.shape.station_id.optional(),
    type: submissionsInsertBase.shape.type.optional(),
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
export type SubmissionWithExtras = z.infer<typeof submissionsSelectSchema> & {
  proposedStation?: z.infer<typeof proposedStationInsert>;
  proposedLocation?: z.infer<typeof proposedLocationInsert>;
  sectors?: z.infer<typeof proposedSectorInsert>[];
  cells?: z.infer<typeof proposedCellInsert>[];
};

export function hasMeaningfulChanges(input: SingleSubmission): boolean {
  if (input.type === "delete") return true;
  const { station_id: _, type: __, ...payload } = input;
  return isNonEmpty(payload);
}

function validateSectorRefs(input: SingleSubmission, targetStation?: { sectors: Array<{ id: number }> } | null) {
  const sectorsInput = input.sectors ?? [];
  const sectorLocalIds = new Set<string>();
  const sectorAzimuths = new Set<number>();
  for (const sector of sectorsInput) {
    if (sectorLocalIds.has(sector.local_id)) throw new ErrorResponse("BAD_REQUEST", { message: "Sector local_id values must be unique" });
    sectorLocalIds.add(sector.local_id);
    if (sectorAzimuths.has(sector.azimuth)) throw new ErrorResponse("BAD_REQUEST", { message: "Sector azimuth values must be unique" });
    sectorAzimuths.add(sector.azimuth);
  }

  const targetSectorIds = new Set(targetStation?.sectors.map((sector) => sector.id) ?? []);
  for (const sector of sectorsInput) {
    if (sector.target_sector_id !== null && sector.target_sector_id !== undefined && !targetSectorIds.has(sector.target_sector_id))
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more target sectors do not belong to the target station" });
  }

  if (sectorsInput.length > MAX_SECTORS)
    throw new ErrorResponse("BAD_REQUEST", { message: `Too many sectors for the submission. Maximum allowed is ${MAX_SECTORS}` });

  for (const cell of input.cells ?? []) {
    if (cell.target_sector_id !== null && cell.target_sector_id !== undefined && !targetSectorIds.has(cell.target_sector_id))
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more cell sector assignments do not belong to the target station" });
    if (cell.sector_local_id && !sectorLocalIds.has(cell.sector_local_id))
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more cell sector assignments reference a missing proposed sector" });
  }
}

export async function validateSubmission(input: SingleSubmission): Promise<void> {
  const { station_id, type, station: stationData, location: locationData } = input;

  const createsPendingStation = (type ?? "new") === "new" && (input.cells?.length ?? 0) === 0;
  if (createsPendingStation && input.pending_photos === undefined)
    throw new ErrorResponse("BAD_REQUEST", { message: "At least one photo is required when submitting a new station without cells" });

  if ((type === "update" || type === "delete") && !station_id)
    throw new ErrorResponse("INVALID_QUERY", { message: "station_id is required for update and delete submissions" });

  const stationId = station_id !== undefined ? Number(station_id) : null;
  if (stationId !== null && Number.isNaN(stationId)) throw new ErrorResponse("INVALID_QUERY");

  const [targetStation, duplicateStation, existingLocation] = await Promise.all([
    stationId !== null
      ? db.query.stations.findFirst({
          where: { id: stationId },
          with: {
            location: true,
            sectors: { columns: { id: true } },
          },
        })
      : null,

    type === "new" && stationData?.station_id
      ? db.query.stations.findFirst({
          where: {
            station_id: stationData.station_id,
            operator_id: stationData.operator_id,
          },
        })
      : null,

    type === "new" && stationData?.station_id && locationData?.latitude !== undefined && locationData?.longitude !== undefined
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
  ]);

  if (stationId !== null && !targetStation) throw new ErrorResponse("NOT_FOUND", { message: "Station not found for the provided station_id" });
  if (stationId !== null && targetStation && targetStation.status !== "published" && targetStation.status !== "pending")
    throw new ErrorResponse("NOT_FOUND", { message: "Station not found for the provided station_id" });
  validateSectorRefs(input, targetStation);

  if (duplicateStation) {
    throw new ErrorResponse("BAD_REQUEST", {
      message: "Station with the provided station_id and operator already exists. Use `existing` mode",
    });
  }

  if (type === "new" && existingLocation && existingLocation.stations && existingLocation.stations.length > 0)
    throw new ErrorResponse("BAD_REQUEST", { message: "The station is already registered at this location" });

  const operatorId = type === "new" ? stationData?.operator_id : targetStation?.operator_id;

  if (input.cells && input.cells.length > 0) {
    validateCellDuplicates(input.cells);
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
    const bandIds = [...new Set(input.cells.map((c) => c.band_id).filter((id): id is number => id !== null && id !== undefined))];
    if (bandIds.length > 0) {
      const bandRows = await db.query.bands.findMany({ where: { id: { in: bandIds } }, columns: { id: true, rat: true, value: true, duplex: true } });
      const bandMap = new Map(bandRows.map((b) => [b.id, b]));
      for (const cell of input.cells) {
        if (cell.operation === "delete" || !cell.band_id || !cell.rat || !cell.details) continue;
        const band = bandMap.get(cell.band_id);
        if (!band?.value) continue;
        const details = cell.details as Record<string, unknown>;
        const arfcn = (details["earfcn"] ?? details["arfcn"]) as number | null | undefined;
        if (arfcn === null || arfcn === undefined) continue;
        if (!isARFCNValidForBand(cell.rat, band.value, arfcn, band.duplex))
          throw new ErrorResponse("BAD_REQUEST", { message: formatARFCNBandErrorMessage(cell.rat, band.value, arfcn) });
      }
    }
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

  const allModifiedCellIds = input.cells?.map((c) => c.target_cell_id).filter((id): id is number => id !== null && id !== undefined) ?? [];
  if (operatorId && input.cells && input.cells.length > 0) {
    const dupEntries = input.cells
      .filter((cell) => cell.details && cell.operation !== "delete")
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

  if (type === "update" && targetStation) {
    const hasStationChanges =
      stationData &&
      (stationData.station_id !== targetStation.station_id ||
        stationData.operator_id !== targetStation.operator_id ||
        (stationData.notes ?? null) !== (targetStation.notes ?? null) ||
        stationData.networks_id !== undefined ||
        stationData.mno_name !== undefined);

    const currentLocation = targetStation.location;
    const hasLocationChanges =
      locationData &&
      currentLocation &&
      (locationData.latitude !== currentLocation.latitude ||
        locationData.longitude !== currentLocation.longitude ||
        locationData.region_id !== currentLocation.region_id ||
        (locationData.city ?? null) !== (currentLocation.city ?? null) ||
        (locationData.address ?? null) !== (currentLocation.address ?? null));

    const hasCellChanges = input.cells && input.cells.length > 0;
    const hasSectorChanges = input.sectors && input.sectors.length > 0;

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

export async function processSubmission(tx: DbTx, input: SingleSubmission, userId: string): Promise<SubmissionWithExtras> {
  const { station_id, type, submitter_note, station: stationData, location: locationData, sectors, cells: proposedCellsInput } = input;

  if (!hasMeaningfulChanges(input))
    throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected. Please modify the data before submitting." });

  const [submission] = await tx
    .insert(submissions)
    .values({
      submitter_id: userId,
      station_id: station_id ?? null,
      type,
      submitter_note: submitter_note ?? null,
      pending_photos: input.pending_photos ?? null,
    })
    .returning();
  if (!submission) throw new ErrorResponse("FAILED_TO_CREATE");

  if (stationData)
    await tx.insert(proposedStations).values({
      ...stationData,
      notes: typeof stationData.notes === "string" && stationData.notes.trim() !== "" ? stationData.notes : null,
      submission_id: submission.id,
      is_confirmed: false,
    });

  if (locationData) await tx.insert(proposedLocations).values({ ...locationData, submission_id: submission.id });

  if (sectors && sectors.length > 0) await tx.insert(proposedSectors).values(sectors.map((sector) => ({ ...sector, submission_id: submission.id })));

  if (input.location_photo_ids && input.location_photo_ids.length > 0) {
    await tx.insert(submissionLocationPhotoSelections).values(
      input.location_photo_ids.map((photoId) => ({
        submission_id: submission.id,
        location_photo_id: photoId,
        is_main: photoId === input.main_location_photo_id,
        is_removal: false,
      })),
    );
  }

  if (input.location_photo_ids_to_remove && input.location_photo_ids_to_remove.length > 0) {
    await tx.insert(submissionLocationPhotoSelections).values(
      input.location_photo_ids_to_remove.map((photoId) => ({
        submission_id: submission.id,
        location_photo_id: photoId,
        is_main: false,
        is_removal: true,
      })),
    );
  }

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
            notes: cell.notes ?? null,
            is_confirmed: false,
            operation: cell.operation ?? "add",
          })
          .returning();
        if (!base) throw new ErrorResponse("FAILED_TO_CREATE");

        if (cell.operation !== "delete") {
          await insertProposedCellDetails(tx, cell.rat, cell.details as Record<string, unknown>, base.id);
        }
      } catch (error) {
        if (error instanceof ErrorResponse) throw error;
        throw new ErrorResponse("FAILED_TO_CREATE", {
          message: `Failed to create proposed ${String(cell.rat ?? "unknown")} cell: ${error instanceof Error ? error.message : "Unknown error"}`,
          cause: error,
        });
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  return { ...submission, proposedStation: stationData, proposedLocation: locationData, sectors, cells: proposedCellsInput };
}
