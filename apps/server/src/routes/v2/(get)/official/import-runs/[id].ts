import { importRunDetailSchema, importRunParamsSchema } from "@openbts/shared/contract";
import type { ImportRunDetail } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { fetchImportRunDetail } from "../../../../../features/official/importRuns.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an import run",
  description:
    "Returns one import run with everything it has recorded so far: the slices it handled, each with its outcome, record counts, " +
    "changes and skipped records; the steps it took after the slices; and the held slices it was told to apply.\n\n" +
    "A dry run undoes what it did, so it lists no slices and no steps. What it would have changed is in `dryRunReport`, " +
    "which is kept for seven days.",
  params: importRunParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: importRunDetailSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof importRunParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ImportRunDetail>>) {
  const run = await fetchImportRunDetail(req.params.id);
  if (!run) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: run });
}

const getImportRun: Route<ReqParams, ImportRunDetail> = {
  url: "/official/import-runs/:id",
  method: "GET",
  config: {
    permissions: ["read:official_import"],
    errorReasons: { 404: "The import run does not exist." },
  },
  schema: schemaRoute,
  handler,
};

export default getImportRun;
