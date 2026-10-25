import { devices, uploadFolds, uploads } from "@openbts/drizzle";
import { type SQL, eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { canManageMeasurements } from "../access.js";

const uploadSelectSchema = createSelectSchema(uploads);
const uploadFoldSelectSchema = createSelectSchema(uploadFolds);
export type UploadRow = z.infer<typeof uploadSelectSchema>;
export type UploadFoldRow = z.infer<typeof uploadFoldSelectSchema>;
export type StoredUpload = { upload: UploadRow; fold: UploadFoldRow | null };
export type ListedUpload = StoredUpload & { userId: string | null };

export const REMOVABLE_STATUSES = ["received", "processing", "processed", "rejected"] as const;

export function selectUploads(sortKey: SQL<string | null> = sql<null>`NULL`) {
  return db
    .select({ upload: uploads, userId: devices.userId, fold: uploadFolds, sortKey })
    .from(uploads)
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .leftJoin(uploadFolds, eq(uploadFolds.uploadId, uploads.id));
}

export async function findVisibleUpload(req: FastifyRequest, userId: string, uploadId: string): Promise<StoredUpload & { isOwn: boolean }> {
  const [row] = await selectUploads().where(eq(uploads.id, uploadId)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const isOwn = row.userId === userId;
  if (!isOwn && !(await canManageMeasurements(req))) throw new ErrorResponse("NOT_FOUND");
  return { upload: row.upload, fold: row.fold, isOwn };
}
