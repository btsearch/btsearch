import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../features/audit/index.js";
import { removeOperator } from "../../../../features/operators/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, IdParams, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
};

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const operator = await db.query.operators.findFirst({
    where: {
      id: id,
      countryCode: LEGACY_COUNTRY_CODE,
    },
  });
  if (!operator) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "operator.delete" }, (tx, audit) => removeOperator(tx, audit, operator));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteOperator: Route<IdParams, void> = {
  url: "/operators/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:operators"],
  },
  schema: schemaRoute,
  handler,
};

export default deleteOperator;
