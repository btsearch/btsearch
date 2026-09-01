import { operators } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, IdParams, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";

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
    },
  });
  if (!operator) throw new ErrorResponse("NOT_FOUND");

  try {
    await db.delete(operators).where(eq(operators.id, id));
    await createAuditLog({ action: "operators.delete", table_name: "operators", record_id: id, old_values: operator, new_values: null }, req);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteOperator: Route<IdParams, void> = {
  url: "/operators/:id",
  method: "DELETE",
  config: { permissions: ["delete:operators"] },
  schema: schemaRoute,
  handler,
};

export default deleteOperator;
