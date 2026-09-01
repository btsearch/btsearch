import { regions } from "@openbts/drizzle";
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

  const region = await db.query.regions.findFirst({
    where: {
      id: id,
    },
  });
  if (!region) throw new ErrorResponse("NOT_FOUND");

  try {
    await db.delete(regions).where(eq(regions.id, id));
    await createAuditLog({ action: "regions.delete", table_name: "regions", record_id: id, old_values: region, new_values: null }, req);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteRegion: Route<IdParams, void> = {
  url: "/regions/:id",
  method: "DELETE",
  config: { permissions: ["delete:regions"] },
  schema: schemaRoute,
  handler,
};

export default deleteRegion;
