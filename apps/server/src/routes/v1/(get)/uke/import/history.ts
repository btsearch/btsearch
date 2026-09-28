import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { getImportJobHistory } from "../../../../../features/ukeImport/job.js";
import { importJobStatusSchema } from "../../../../../features/ukeImport/schemas.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  response: {
    200: z.object({ data: z.array(importJobStatusSchema) }),
  },
};

type ResponseData = z.infer<typeof importJobStatusSchema>[];

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseData>>) {
  return res.send({ data: await getImportJobHistory() });
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
