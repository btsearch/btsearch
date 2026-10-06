import {
  attachments,
  locationPhotos,
  notifications,
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
  submissionPhotos,
  submissions,
} from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { deletePhotoFiles } from "../../utils/photoFiles.js";
import { hasStaffPermission } from "../access/staff.js";
import { auditContextFromRequest, runAuditedOperation } from "../audit/index.js";
import { lockSubmission } from "./lock.js";

export async function removeSubmission(req: FastifyRequest, id: string, userId: string): Promise<void> {
  const hasAdminPermission = await hasStaffPermission(req, { submissions: ["delete_all"] });

  const submission = await db.query.submissions.findFirst({
    where: {
      id: id,
    },
  });

  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (!hasAdminPermission && submission.submitter_id !== userId) throw new ErrorResponse("FORBIDDEN");
  if (!hasAdminPermission && submission.status !== "pending") {
    throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be deleted" });
  }

  let attachmentUuids: string[] = [];

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.delete", metadata: { submission_id: id } }, async (tx, audit) => {
      const locked = await lockSubmission(tx, id);
      if (!locked) throw new ErrorResponse("NOT_FOUND");
      if (locked.status !== submission.status) throw new ErrorResponse("CONFLICT", { message: "This submission has just been reviewed" });

      const cellsBase = await tx.query.proposedCells.findMany({
        where: {
          submission_id: id,
        },
        columns: { id: true },
      });
      const proposed_cell_ids = cellsBase.map((c) => c.id).filter((n): n is number => n !== null && n !== undefined);

      if (proposed_cell_ids.length > 0) {
        await Promise.all([
          tx.delete(proposedGSMCells).where(inArray(proposedGSMCells.proposed_cell_id, proposed_cell_ids)),
          tx.delete(proposedUMTSCells).where(inArray(proposedUMTSCells.proposed_cell_id, proposed_cell_ids)),
          tx.delete(proposedLTECells).where(inArray(proposedLTECells.proposed_cell_id, proposed_cell_ids)),
          tx.delete(proposedNRCells).where(inArray(proposedNRCells.proposed_cell_id, proposed_cell_ids)),
        ]);
      }

      await tx.delete(proposedCells).where(eq(proposedCells.submission_id, id));
      await Promise.all([
        tx.delete(proposedSectors).where(eq(proposedSectors.submission_id, id)),
        tx.delete(proposedStations).where(eq(proposedStations.submission_id, id)),
        tx.delete(proposedLocations).where(eq(proposedLocations.submission_id, id)),
        tx.delete(notifications).where(eq(notifications.submissionId, id)),
      ]);

      const photos = await tx.query.submissionPhotos.findMany({
        where: { submission_id: id },
        columns: { attachment_id: true },
      });
      const attachmentIds = photos.map((p) => p.attachment_id).filter((n): n is number => n !== null && n !== undefined);
      const publishedPhotos =
        attachmentIds.length > 0
          ? await tx
              .selectDistinct({ attachmentId: locationPhotos.attachment_id })
              .from(locationPhotos)
              .where(inArray(locationPhotos.attachment_id, attachmentIds))
          : [];
      const publishedAttachmentIds = new Set(publishedPhotos.map((photo) => photo.attachmentId));
      const unpublishedAttachmentIds = attachmentIds.filter((attachmentId) => !publishedAttachmentIds.has(attachmentId));

      await tx.delete(submissionPhotos).where(eq(submissionPhotos.submission_id, id));

      if (unpublishedAttachmentIds.length > 0) {
        const rows = await tx.query.attachments.findMany({
          where: { id: { in: unpublishedAttachmentIds } },
          columns: { id: true, uuid: true },
        });
        attachmentUuids = rows.map((r) => r.uuid);
        await tx.delete(attachments).where(inArray(attachments.id, unpublishedAttachmentIds));
      }

      await tx.delete(submissions).where(eq(submissions.id, id));
      await audit.log({
        entity: "submissions",
        op: "delete",
        recordId: id,
        stationId: submission.station_id,
        old: submission,
      });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  await deletePhotoFiles(attachmentUuids);
}
