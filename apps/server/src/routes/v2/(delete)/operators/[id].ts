import { noContentSchema, operatorParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { removeOperator } from "../../../../features/operators/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete an operator",
  description: "Deletes an operator together with its PLMNs, its memberships in shared networks and the statistics history kept for it.",
  params: operatorParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  404: "The operator does not exist.",
  409:
    "The operator still has stations or sites in the official register, or a pending submission names it. " +
    "A shared network cannot be deleted while it still has members.",
};
type ReqParams = { Params: z.infer<typeof operatorParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const operator = await db.query.operators.findFirst({ where: { id } });
  if (!operator) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "operator.delete" }, (tx, audit) => removeOperator(tx, audit, operator));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteOperator: Route<ReqParams, void> = {
  url: "/operators/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:operators"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default deleteOperator;
