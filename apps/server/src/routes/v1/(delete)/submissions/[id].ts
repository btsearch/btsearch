import {
  attachments,
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
import type { FastifyRequest } from "fastify/types/request.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../plugins/auth/utils.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const schemaRoute = {
  params: z.object({
    id: z.coerce.string<string>(),
  }),
};

type ReqParams = { Params: { id: string } };
async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const { id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const userId = session.user.id;

  const hasAdminPermission = await verifyPermissions(session.user.id, { submissions: ["delete_all"] });

  const submission = await db.query.submissions.findFirst({
    where: {
      id: id,
    },
  });

  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (!hasAdminPermission && submission.submitter_id !== userId) throw new ErrorResponse("FORBIDDEN");
  if (!hasAdminPermission && submission.status !== "pending")
    throw new ErrorResponse("BAD_REQUEST", { message: "Only pending submissions can be deleted" });

  let attachmentUuids: string[] = [];

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.delete", metadata: { submission_id: id } }, async (tx, audit) => {
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

      await tx.delete(submissionPhotos).where(eq(submissionPhotos.submission_id, id));

      if (attachmentIds.length > 0) {
        const rows = await tx.query.attachments.findMany({
          where: { id: { in: attachmentIds } },
          columns: { id: true, uuid: true },
        });
        attachmentUuids = rows.map((r) => r.uuid);
        await tx.delete(attachments).where(inArray(attachments.id, attachmentIds));
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

  await Promise.all(attachmentUuids.map((uuid) => fs.unlink(path.join(UPLOAD_DIR, `${uuid}.webp`)).catch(() => {})));

  return res.status(204).send();
}

const deleteSubmission: Route<ReqParams, void> = {
  url: "/submissions/:id",
  method: "DELETE",
  config: { permissions: ["delete:submissions"] },
  schema: schemaRoute,
  handler,
};

export default deleteSubmission;
