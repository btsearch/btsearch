import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../features/audit/index.js";
import { removeBand } from "../../../../features/bands/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, IdParams, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
};

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const band = await db.query.bands.findFirst({
    where: {
      id: id,
    },
  });
  if (!band) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "band.delete" }, (tx, audit) => removeBand(tx, audit, band));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteBand: Route<IdParams, void> = {
  url: "/bands/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:bands"],
  },
  schema: schemaRoute,
  handler,
};

export default deleteBand;
