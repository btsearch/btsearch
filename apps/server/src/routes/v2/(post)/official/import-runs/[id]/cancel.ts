import { officialImportRuns } from "@openbts/drizzle";
import { importRunParamsSchema, importRunSchema } from "@openbts/shared/contract";
import type { ImportRun } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { cancelRun } from "../../../../../../features/official/import/runs.js";
import { fetchImportRun } from "../../../../../../features/official/importRuns.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Cancel an import run",
  description:
    "Cancels a run that is queued or running and returns it. A queued run never starts. " +
    "A running run stops before its next slice or step: what it has applied until then stays applied, and nothing is undone.",
  params: importRunParamsSchema,
  response: {
    200: z.object({
      data: importRunSchema,
    }),
  },
};
const errorReasons = {
  404: "The import run does not exist.",
  409: "The run has already ended: it is done, it failed or it was cancelled before.",
};
type ReqParams = { Params: z.infer<typeof importRunParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ImportRun>>) {
  const { id } = req.params;

  const [stored] = await db.select({ id: officialImportRuns.id }).from(officialImportRuns).where(eq(officialImportRuns.id, id)).limit(1);
  if (!stored) throw new ErrorResponse("NOT_FOUND");
  if (!(await cancelRun(db, id))) throw new ErrorResponse("CONFLICT", { message: "This import run has already ended" });

  const run = await fetchImportRun(id);
  if (!run) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: run });
}

const cancelImportRun: Route<ReqParams, ImportRun> = {
  url: "/official/import-runs/:id/cancel",
  method: "POST",
  config: {
    permissions: ["run:official_import"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default cancelImportRun;
