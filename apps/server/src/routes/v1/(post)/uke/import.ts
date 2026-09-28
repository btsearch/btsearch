import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { auditContextFromRequest, recordAuditOperation } from "../../../../features/audit/index.js";
import { startImportJob } from "../../../../features/ukeImport/job.js";
import { importJobStatusSchema } from "../../../../features/ukeImport/schemas.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  body: z.object({
    importPermits: z.boolean().optional().default(true),
    importRadiolines: z.boolean().optional().default(true),
    importDeviceRegistry: z.boolean().optional().default(true),
  }),
  response: {
    200: z.object({
      data: importJobStatusSchema,
    }),
  },
};

type ReqBody = {
  Body: z.infer<typeof schemaRoute.body>;
};

type ResponseData = z.infer<typeof importJobStatusSchema>;

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { status } = await startImportJob(req.body);
  await recordAuditOperation(auditContextFromRequest(req, "import"), {
    kind: "uke.import",
    metadata: { config: req.body, status: status.state },
  });
  return res.send({ data: status });
}

const importUkeData: Route<ReqBody, ResponseData> = {
  url: "/uke/import",
  method: "POST",
  schema: schemaRoute,
  config: {
    permissions: ["run:uke_import"],
    allowGuestAccess: false,
  },
  handler,
};

export default importUkeData;
