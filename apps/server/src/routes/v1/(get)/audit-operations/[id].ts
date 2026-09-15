import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { fetchAuditOperation } from "../../../../services/audit/read.js";
import { auditOperationDetailSchema } from "../../../../services/audit/schemas.js";
import type { AuditOperationWithEntries } from "../../../../services/audit/types.js";

const schemaRoute = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  response: { 200: z.object({ data: auditOperationDetailSchema }) },
};

type RequestData = { Params: z.infer<typeof schemaRoute.params> };
type ResponseBody = { data: AuditOperationWithEntries };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const operation = await fetchAuditOperation(req.params.id);
  if (operation === null) throw new ErrorResponse("NOT_FOUND");
  return res.send({ data: operation });
}

const getAuditOperation: Route<RequestData, ResponseBody> = {
  url: "/audit-operations/:id",
  method: "GET",
  config: {
    permissions: ["read:audit_operations"],
  },
  schema: schemaRoute,
  handler,
};

export default getAuditOperation;
