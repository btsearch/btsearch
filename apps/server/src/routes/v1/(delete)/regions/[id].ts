import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../features/audit/index.js";
import { removeRegion } from "../../../../features/regions/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, IdParams, Route } from "../../../../interfaces/routes.interface.js";

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
      countryCode: LEGACY_COUNTRY_CODE,
    },
  });
  if (!region) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "region.delete" }, (tx, audit) => removeRegion(tx, audit, region));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteRegion: Route<IdParams, void> = {
  url: "/regions/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:regions"],
  },
  schema: schemaRoute,
  handler,
};

export default deleteRegion;
