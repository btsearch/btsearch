import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { importJobStatusSchema } from "../../../../../services/ukeImport/schemas.js";
import { getImportJobStatus } from "../../../../../services/ukeImportJob.service.js";

const schemaRoute = {
  response: {
    200: z.object({
      data: importJobStatusSchema,
    }),
  },
};

type ResponseData = z.infer<typeof importJobStatusSchema>;

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseData>>) {
  const status = await getImportJobStatus();
  return res.send({ data: status });
}

const getUkeImportStatus: Route<Record<string, never>, ResponseData> = {
  url: "/uke/import/status",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:uke_import"],
    allowGuestAccess: false,
  },
  handler,
};

export default getUkeImportStatus;
