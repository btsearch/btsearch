import { devices, uploads } from "@openbts/drizzle";
import type { MeasurementContentType, MeasurementUpload } from "@openbts/shared/contract";
import { type SQL, eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { canManageDevices } from "./devices.js";
import { PURGE_INTERVAL_MS, REJECTED_FILE_DAYS } from "./purge.js";
import { rawFilePath } from "./rawStore.js";

const uploadSelectSchema = createSelectSchema(uploads);
export type UploadRow = z.infer<typeof uploadSelectSchema>;
type UploadEncoding = UploadRow["encoding"];

const DAY_MS = 24 * 60 * 60 * 1000;

export const REMOVABLE_STATUSES = ["received", "processing", "processed", "rejected"] as const;

export const ENCODING_CONTENT_TYPES: Record<UploadEncoding, MeasurementContentType> = {
  zstd: "application/zstd",
  gzip: "application/gzip",
};

export function encodingOf(contentType: MeasurementContentType): UploadEncoding {
  return contentType === "application/zstd" ? "zstd" : "gzip";
}

export function uploadFilePath(upload: UploadRow): string {
  return rawFilePath(upload.receivedAt, upload.id, upload.bodySha256);
}

export function fileExpiry(upload: UploadRow, retentionDays: number): Date | null {
  if (upload.objectDeletedAt !== null) return null;

  const retainedUntil = upload.receivedAt.getTime() + retentionDays * DAY_MS;
  if (upload.status === "withdrawn") return new Date(upload.statusChangedAt.getTime() + PURGE_INTERVAL_MS);
  if (upload.status === "rejected") return new Date(Math.min(upload.statusChangedAt.getTime() + REJECTED_FILE_DAYS * DAY_MS, retainedUntil));
  return new Date(retainedUntil);
}

export function selectUploads(sortKey: SQL<string | null> = sql<null>`NULL`) {
  return db.select({ upload: uploads, userId: devices.userId, sortKey }).from(uploads).innerJoin(devices, eq(devices.id, uploads.deviceId));
}

export async function findVisibleUpload(req: FastifyRequest, userId: string, uploadId: string): Promise<{ upload: UploadRow; isOwn: boolean }> {
  const [row] = await selectUploads().where(eq(uploads.id, uploadId)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const isOwn = row.userId === userId;
  if (!isOwn && !(await canManageDevices(req))) throw new ErrorResponse("NOT_FOUND");
  return { upload: row.upload, isOwn };
}

export function toMeasurementUpload(upload: UploadRow, retentionDays: number): MeasurementUpload {
  return {
    id: upload.id,
    deviceId: upload.deviceId,
    status: upload.status,
    statusReason: upload.statusReason,
    contentType: ENCODING_CONTENT_TYPES[upload.encoding],
    sizeBytes: upload.bodyBytes,
    receivedAt: upload.receivedAt.toISOString(),
    updatedAt: upload.statusChangedAt.toISOString(),
    result: null,
    fileExpiresAt: fileExpiry(upload, retentionDays)?.toISOString() ?? null,
  };
}
