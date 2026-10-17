import { importRunCreateSchema, importRunSchema } from "@openbts/shared/contract";
import type { ImportRun, ImportRunCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { fetchImportRun, queueRequestedRun, recordRunRequest } from "../../../../../features/official/importRuns.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Start an import run",
  description:
    "Queues an import run for a source and returns it. The run starts as soon as the importer is free, " +
    "so poll `GET /official/import-runs/{id}` to follow it.\n\n" +
    "Without `datasetIds` the run reads every enabled dataset of the source. Name a dataset to read it while it is paused. " +
    "A source's own `isEnabled` only stops the schedule, so you can start a run for a source that is switched off.\n\n" +
    "To apply a slice that an earlier run held, name it in `approvals` with the release that run read. " +
    "If the source has published another release since then, the slice is held again.\n\n" +
    "The request is refused while the source has a queued or running run of the same kind, so wait until that one has ended. " +
    "A `remap` run cannot be started here: `PATCH /official/licensees/{id}` queues it.",
  body: importRunCreateSchema,
  response: {
    201: z.object({
      data: importRunSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request is invalid, the source does not exist, a dataset does not belong to the source, " +
    "the source has no enabled dataset and you named none, " +
    "or an approval names a dataset the run does not read or a release that does not cover its slice.",
  409: "The source already has a run of this kind that is queued or running.",
};
type ReqBody = { Body: ImportRunCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ImportRun>>) {
  try {
    const runId = await db.transaction((tx) => queueRequestedRun(tx, req.body, req.userSession?.user?.id ?? null));
    await recordRunRequest(req, runId, req.body);

    const run = await fetchImportRun(runId);
    if (!run) throw new ErrorResponse("FAILED_TO_CREATE");

    return res.status(201).send({ data: run });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const startImportRun: Route<ReqBody, ImportRun> = {
  url: "/official/import-runs",
  method: "POST",
  config: {
    permissions: ["run:official_import"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default startImportRun;
