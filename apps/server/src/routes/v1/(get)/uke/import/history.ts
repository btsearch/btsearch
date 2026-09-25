import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { importJobStatusSchema } from "../../../../../services/ukeImport/schemas.js";
import { getImportJobHistory } from "../../../../../services/ukeImportJob.service.js";

const schemaRoute = {
  response: {
    200: z.object({ data: z.array(importJobStatusSchema) }),
  },
};

type ResponseData = z.infer<typeof importJobStatusSchema>[];

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseData>>) {
  res.send({ data: await getImportJobHistory() });
}

const getUkeImportHistory: Route<Record<string, never>, ResponseData> = {
  url: "/uke/import/history",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:uke_import"],
    allowGuestAccess: false,
  },
  handler,
};

export default getUkeImportHistory;
