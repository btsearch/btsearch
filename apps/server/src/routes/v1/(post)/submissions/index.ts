import { stations } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import { notifyStaffNewSubmission } from "../../../../services/notifications/service.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";
import {
  type SingleSubmission,
  type SubmissionWithExtras,
  processSubmission,
  proposedCellInsert,
  proposedLocationInsert,
  proposedStationInsert,
  singleSubmissionSchema,
  submissionsSelectSchema,
  validateSubmission,
} from "../../../../services/submissions/create.js";
import { logger } from "../../../../utils/logger.js";

const requestSchema = z.union([singleSubmissionSchema, z.array(singleSubmissionSchema).min(1).max(10)]);

type ReqBody = { Body: z.infer<typeof requestSchema> };
const schemaRoute = {
  body: requestSchema,
  response: {
    200: z.object({
      data: z.array(
        submissionsSelectSchema.extend({
          proposedStation: proposedStationInsert.optional(),
          proposedLocation: proposedLocationInsert.optional(),
          cells: z.array(proposedCellInsert).optional(),
        }),
      ),
    }),
  },
};

type ResponseData = z.infer<typeof submissionsSelectSchema>[];

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const userSession = req.userSession;
  if (!userSession?.user?.id) throw new ErrorResponse("UNAUTHORIZED");
  const userId = userSession.user.id;
  if (Number.isNaN(userId)) throw new ErrorResponse("UNAUTHORIZED");

  const submissionInputs: SingleSubmission[] = Array.isArray(req.body) ? req.body : [req.body];

  await Promise.all(submissionInputs.map(validateSubmission));

  try {
    const results = await db.transaction(async (tx) => {
      const created: SubmissionWithExtras[] = [];
      for (const input of submissionInputs) {
        // eslint-disable-next-line no-await-in-loop
        created.push(await processSubmission(tx, input, userId));
      }
      return created;
    });

    await Promise.all(
      results.map((submission) =>
        createAuditLog(
          {
            action: "submissions.create",
            table_name: "submissions",
            record_id: undefined,
            old_values: null,
            new_values: submission,
            metadata: { submission_id: submission.id },
          },
          req,
        ),
      ),
    );

    const submitterName = userSession.user.name || userSession.user.username || "Unknown";

    const stationIdsToResolve = results.filter((s) => !s.proposedStation?.station_id && s.station_id).map((s) => s.station_id!);

    const uniqueStationIds = Array.from(new Set(stationIdsToResolve));
    const resolvedStations =
      uniqueStationIds.length > 0
        ? await db.select({ id: stations.id, station_id: stations.station_id }).from(stations).where(inArray(stations.id, uniqueStationIds))
        : [];

    const stationIdMap = new Map(resolvedStations.map((s) => [s.id, s.station_id]));

    for (const submission of results) {
      if (
        submission.pending_photos &&
        !submission.proposedStation &&
        !submission.proposedLocation &&
        (!submission.cells || submission.cells.length === 0) &&
        !submission.submitter_note
      )
        continue;

      const stationStringId = submission.proposedStation?.station_id ?? (submission.station_id ? stationIdMap.get(submission.station_id) : undefined);

      void notifyStaffNewSubmission({
        submissionId: submission.id,
        submitterName,
        submissionType: submission.type ?? "new",
        stationId: stationStringId ?? undefined,
      }).catch((e) => logger.error("Failed to notify staff about new submission", { error: e }));
    }

    return res.send({ data: results });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: error instanceof Error ? error.message : "Unknown error", cause: error });
  }
}

const createSubmission: Route<ReqBody, ResponseData> = {
  url: "/submissions",
  method: "POST",
  config: { permissions: ["write:submissions"] },
  schema: schemaRoute,
  handler,
};

export default createSubmission;
