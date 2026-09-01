import { bands } from "@openbts/drizzle";
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

  const band = await db.query.bands.findFirst({
    where: {
      id: id,
    },
  });
  if (!band) throw new ErrorResponse("NOT_FOUND");

  try {
    await db.delete(bands).where(eq(bands.id, id));
    await createAuditLog({ action: "bands.delete", table_name: "bands", record_id: id, old_values: band, new_values: null }, req);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteBand: Route<IdParams, void> = {
  url: "/bands/:id",
  method: "DELETE",
  config: { permissions: ["delete:bands"] },
  schema: schemaRoute,
  handler,
};

export default deleteBand;
