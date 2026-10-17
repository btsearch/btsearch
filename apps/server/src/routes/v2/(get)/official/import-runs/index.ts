import { importRunListQuerySchema, importRunListSchema } from "@openbts/shared/contract";
import type { ImportRunList, ImportRunListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchImportRunPage } from "../../../../../features/official/importRuns.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List import runs",
  description:
    "Returns the import runs of the official sources, newest first. " +
    "Get a single run to see its slices, its steps and, for a dry run, its report.",
  querystring: importRunListQuerySchema,
  response: {
    200: importRunListSchema,
  },
};
type ReqQuery = { Querystring: ImportRunListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ImportRunList>>) {
  const page = await fetchImportRunPage(req.query);

  return res.send({ data: page.data, paging: { limit: req.query.limit, nextCursor: page.nextCursor } });
}

const getImportRuns: Route<ReqQuery, ImportRunList> = {
  url: "/official/import-runs",
  method: "GET",
  config: { permissions: ["read:official_import"] },
  schema: schemaRoute,
  handler,
};

export default getImportRuns;
