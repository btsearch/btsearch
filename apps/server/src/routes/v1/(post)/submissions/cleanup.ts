import {
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
} from "@openbts/drizzle";
import { inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../services/audit/index.js";

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        cleaned: z.number(),
      }),
    }),
  },
};

type ResponseData = { cleaned: number };

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const staleSubmissions = await db.query.submissions.findMany({
    where: {
      createdAt: { lt: oneMonthAgo },
    },
    columns: { id: true },
  });

  if (staleSubmissions.length === 0) return res.send({ data: { cleaned: 0 } });

  const submissionIds = staleSubmissions.map((s) => s.id);

  await runAuditedOperation(
    auditContextFromRequest(req),
    {
      kind: "submission.cleanup",
      allowEmpty: true,
      metadata: { cleaned_count: submissionIds.length, older_than: oneMonthAgo.toISOString() },
    },
    async (tx) => {
      const proposedCellRows = await tx.query.proposedCells.findMany({
        where: {
          submission_id: { in: submissionIds },
        },
        columns: { id: true },
      });
      const cellIds = proposedCellRows.map((c) => c.id);

      if (cellIds.length > 0) {
        await Promise.all([
          tx.delete(proposedGSMCells).where(inArray(proposedGSMCells.proposed_cell_id, cellIds)),
          tx.delete(proposedUMTSCells).where(inArray(proposedUMTSCells.proposed_cell_id, cellIds)),
          tx.delete(proposedLTECells).where(inArray(proposedLTECells.proposed_cell_id, cellIds)),
          tx.delete(proposedNRCells).where(inArray(proposedNRCells.proposed_cell_id, cellIds)),
        ]);
        await tx.delete(proposedCells).where(inArray(proposedCells.submission_id, submissionIds));
      }

      await tx.delete(proposedSectors).where(inArray(proposedSectors.submission_id, submissionIds));
      await tx.delete(proposedStations).where(inArray(proposedStations.submission_id, submissionIds));
      await tx.delete(proposedLocations).where(inArray(proposedLocations.submission_id, submissionIds));
    },
  );

  return res.send({ data: { cleaned: submissionIds.length } });
}

const cleanupSubmissions: Route<Record<string, never>, ResponseData> = {
  url: "/submissions/cleanup",
  method: "POST",
  config: { permissions: ["cleanup:submissions"] },
  schema: schemaRoute,
  handler,
};

export default cleanupSubmissions;
