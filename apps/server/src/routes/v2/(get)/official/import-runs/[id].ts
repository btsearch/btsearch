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
  },
  schema: schemaRoute,
  handler,
};

export default getImportRun;
