import { bandParamsSchema, noContentSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { removeBand } from "../../../../features/bands/remove.js";
import { isUnknownBand } from "../../../../features/bands/unknown.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a band",
  description: "Deletes the band and removes it from every country's band plan.",
  params: bandParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof bandParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const band = await db.query.bands.findFirst({ where: { id } });
  if (!band || isUnknownBand(band)) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "band.delete" }, (tx, audit) => removeBand(tx, audit, band));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteBand: Route<ReqParams, void> = {
  url: "/bands/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:bands"],
    errorReasons: {
      404: "The band does not exist.",
      409: "The band is still used by cells, permits in the official register, submissions or stored statistics.",
    },
  },
  schema: schemaRoute,
  handler,
};

export default deleteBand;
