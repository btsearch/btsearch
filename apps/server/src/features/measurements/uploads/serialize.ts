import { observedCells, uploadClosedCountries, uploadDrops, uploadNewSquares } from "@openbts/drizzle";
import { MEASUREMENT_REJECTION_REASONS } from "@openbts/shared/contract";
import type { MeasurementDevice, MeasurementRejectionReason, MeasurementUpload, MeasurementUploadListQuery, UserRef } from "@openbts/shared/contract";
import { count, inArray, sum } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { loadUserRefs } from "../../users/userRef.js";
import { canManageMeasurements } from "../access.js";
import { findDevices } from "../devices/serialize.js";
import { fileExpiry } from "../rawFiles/purge.js";
import { ENCODING_CONTENT_TYPES } from "./body.js";
import { countSitesFoundFirst, countedFold } from "./counting.js";
import type { ListedUpload, StoredUpload, UploadFoldRow, UploadRow } from "./read.js";

type UploadInclude = NonNullable<MeasurementUploadListQuery["include"]>[number];
type UploadIncludes = { uploaders?: ReadonlyMap<string, UserRef>; devicesById?: ReadonlyMap<string, MeasurementDevice> };
type Excluders = ReadonlyMap<string, UserRef>;
type UploadResult = NonNullable<MeasurementUpload["result"]>;
type ResultSource = { uploadId: string; processedAt: Date; fold: UploadFoldRow | null };

const NO_SAMPLES: MeasurementRejectionReason = "noSamples";

function resultSource(stored: StoredUpload): ResultSource | null {
  const fold = countedFold(stored);
  if (fold !== null) return { uploadId: fold.uploadId, processedAt: fold.foldedAt, fold };

  const { upload } = stored;
  if (upload.status !== "rejected" || upload.statusReason !== NO_SAMPLES) return null;
  return { uploadId: upload.id, processedAt: upload.statusChangedAt, fold: null };
}

async function loadUploadResults(stored: readonly StoredUpload[]): Promise<Map<string, UploadResult>> {
  const sources = stored.flatMap((row) => resultSource(row) ?? []);
  if (sources.length === 0) return new Map();

  const uploadIds = sources.map((source) => source.uploadId);
  const [drops, closedCountries, squares, cells, sites] = await Promise.all([
    db.select().from(uploadDrops).where(inArray(uploadDrops.uploadId, uploadIds)),
    db.select().from(uploadClosedCountries).where(inArray(uploadClosedCountries.uploadId, uploadIds)),
    db
      .select({ uploadId: uploadNewSquares.uploadId, count: sum(uploadNewSquares.squareCount).mapWith(Number) })
      .from(uploadNewSquares)
      .where(inArray(uploadNewSquares.uploadId, uploadIds))
      .groupBy(uploadNewSquares.uploadId),
    db
      .select({ uploadId: observedCells.firstUploadId, count: count() })
      .from(observedCells)
      .where(inArray(observedCells.firstUploadId, uploadIds))
      .groupBy(observedCells.firstUploadId),
    countSitesFoundFirst(uploadIds),
  ]);
  const cellsFound = new Map(cells.map((row) => [row.uploadId, row.count]));
  const sitesFound = new Map(sites.map((row) => [row.uploadId, row.count]));
  const squaresFound = new Map(squares.map((row) => [row.uploadId, row.count]));
  const closedCountriesByUpload = Map.groupBy(closedCountries, (row) => row.uploadId);
  const droppedByUpload = new Map<string, UploadResult["samples"]["dropped"]>();
  for (const drop of drops) droppedByUpload.set(drop.uploadId, { ...droppedByUpload.get(drop.uploadId), [drop.reason]: drop.sampleCount });

  return new Map(
    sources.map(({ uploadId, processedAt, fold }) => {
      const dropped = droppedByUpload.get(uploadId) ?? {};
      const droppedCount = Object.values(dropped).reduce((counted, samples) => counted + samples, 0);
      const total = fold?.sampleCount ?? droppedCount;
      const result: UploadResult = {
        processedAt: processedAt.toISOString(),
        startedAt: fold?.startedAt.toISOString() ?? null,
        endedAt: fold?.endedAt.toISOString() ?? null,
        bbox: fold === null ? null : { west: fold.west, south: fold.south, east: fold.east, north: fold.north },
        samples: {
          total,
          kept: total - droppedCount,
          distanceOnly: fold?.distanceOnlyCount ?? 0,
          dropped,
          closedCountryCodes: (closedCountriesByUpload.get(uploadId) ?? []).map((row) => row.countryCode).toSorted(),
        },
        discoveries: { cells: cellsFound.get(uploadId) ?? 0, sites: sitesFound.get(uploadId) ?? 0, squares: squaresFound.get(uploadId) ?? 0 },
      };
      return [uploadId, result];
    }),
  );
}

async function loadExcluders(req: FastifyRequest, stored: readonly StoredUpload[]): Promise<Excluders | undefined> {
  const excluded = stored.filter(({ upload }) => upload.status === "excluded");
  if (excluded.length === 0 || !(await canManageMeasurements(req))) return undefined;
  return loadUserRefs(excluded.map(({ upload }) => upload.excludedById));
}

function rejectionReasonOf(upload: UploadRow): MeasurementRejectionReason | null {
  if (upload.status !== "rejected") return null;
  return MEASUREMENT_REJECTION_REASONS.find((reason) => reason === upload.statusReason) ?? null;
}

function exclusionOf(upload: UploadRow, excluders: Excluders | undefined): MeasurementUpload["exclusion"] {
  if (upload.status !== "excluded") return null;
  const exclusion: NonNullable<MeasurementUpload["exclusion"]> = { reason: upload.statusReason ?? "", at: upload.statusChangedAt.toISOString() };
  if (excluders) exclusion.by = upload.excludedById === null ? null : (excluders.get(upload.excludedById) ?? null);
  return exclusion;
}

function buildMeasurementUpload(
  stored: StoredUpload,
  retentionDays: number,
  result: UploadResult | null,
  excluders: Excluders | undefined,
): MeasurementUpload {
  const { upload } = stored;
  return {
    id: upload.id,
    deviceId: upload.deviceId,
    status: upload.status,
    rejectionReason: rejectionReasonOf(upload),
    exclusion: exclusionOf(upload, excluders),
    contentType: ENCODING_CONTENT_TYPES[upload.encoding],
    sizeBytes: upload.bodyBytes,
    receivedAt: upload.receivedAt.toISOString(),
    updatedAt: upload.statusChangedAt.toISOString(),
    attempts: upload.attempts,
    result,
    fileExpiresAt: fileExpiry(stored, retentionDays)?.toISOString() ?? null,
  };
}

async function loadUploadIncludes(req: FastifyRequest, rows: readonly ListedUpload[], include: readonly UploadInclude[]): Promise<UploadIncludes> {
  const [uploaders, devicesById] = await Promise.all([
    include.includes("uploader") ? loadUserRefs(rows.map((row) => row.userId)) : undefined,
    include.includes("device")
      ? findDevices(
          req,
          rows.map((row) => row.upload.deviceId),
        )
      : undefined,
  ]);
  return { uploaders, devicesById };
}

export async function toMeasurementUploads(
  req: FastifyRequest,
  rows: readonly ListedUpload[],
  retentionDays: number,
  include: readonly UploadInclude[] = [],
): Promise<MeasurementUpload[]> {
  const [results, excluders, { uploaders, devicesById }] = await Promise.all([
    loadUploadResults(rows),
    loadExcluders(req, rows),
    loadUploadIncludes(req, rows, include),
  ]);
  return rows.map((row) => {
    const upload = buildMeasurementUpload(row, retentionDays, results.get(row.upload.id) ?? null, excluders);
    if (uploaders) upload.uploader = row.userId === null ? null : (uploaders.get(row.userId) ?? null);
    const device = devicesById?.get(row.upload.deviceId);
    if (device) upload.device = device;
    return upload;
  });
}

export async function toMeasurementUpload(req: FastifyRequest, stored: StoredUpload, retentionDays: number): Promise<MeasurementUpload> {
  const [results, excluders] = await Promise.all([loadUploadResults([stored]), loadExcluders(req, [stored])]);
  return buildMeasurementUpload(stored, retentionDays, results.get(stored.upload.id) ?? null, excluders);
}
