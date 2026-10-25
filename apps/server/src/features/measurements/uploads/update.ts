import type { MeasurementUploadConflict, MeasurementUploadUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify";

import { DetailedErrorResponse, ErrorResponse } from "../../../errors.js";
import { canManageMeasurements } from "../access.js";
import { excludeUploads, restoreUpload } from "./exclusions.js";
import { findVisibleUpload } from "./read.js";
import { withdrawUploads } from "./withdrawals.js";

async function assertCanManage(req: FastifyRequest, message: string): Promise<void> {
  if (!(await canManageMeasurements(req))) throw new ErrorResponse("FORBIDDEN", { message });
}

function conflict(kind: MeasurementUploadConflict["kind"], message: string): DetailedErrorResponse {
  return new DetailedErrorResponse("CONFLICT", [{ kind }], { message });
}

export async function updateUpload(req: FastifyRequest, userId: string, uploadId: string, change: MeasurementUploadUpdate): Promise<void> {
  const { upload, isOwn } = await findVisibleUpload(req, userId, uploadId);
  if (change.status === "withdrawn") {
    if (!isOwn) throw new ErrorResponse("FORBIDDEN", { message: "Only the person who sent an upload can withdraw it" });
    if (upload.status === "excluded") throw conflict("excluded", "An excluded upload cannot be withdrawn");
    await withdrawUploads(userId, { uploadIds: [upload.id] });
  } else if (change.exclusion === null) {
    await assertCanManage(req, "Only an administrator can restore an upload");
    if (upload.status !== "excluded") throw conflict("notExcluded", "Only an excluded upload can be restored");
    if (upload.objectDeletedAt !== null) {
      throw new DetailedErrorResponse("GONE", [{ kind: "fileDeleted" }], { message: "The upload's file is gone, so it cannot be folded in again" });
    }
    await restoreUpload(req, upload);
  } else if (change.exclusion !== undefined) {
    await assertCanManage(req, "Only an administrator can exclude an upload");
    if (upload.status === "withdrawn") throw conflict("withdrawn", "A withdrawn upload cannot be excluded");
    await excludeUploads(req, { uploadIds: [upload.id], reason: change.exclusion.reason });
  }
}
