import { noContentSchema, regionParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { removeRegion } from "../../../../features/regions/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a region",
  description: "Deletes a region. Its stored boundary, which is used to find the region for a pair of coordinates, is deleted with it.",
  params: regionParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  404: "The region does not exist.",
  409:
    "The region still has locations, or an editor's grant is limited to it. " +
    "Locations of the official register and locations proposed in submissions count as well.",
};
type ReqParams = { Params: z.infer<typeof regionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const region = await db.query.regions.findFirst({ where: { id } });
  if (!region) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "region.delete" }, (tx, audit) => removeRegion(tx, audit, region));
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteRegion: Route<ReqParams, void> = {
  url: "/regions/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:regions"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default deleteRegion;
