import { noContentSchema, stationParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { deactivateStation } from "../../../../features/stations/edit.js";
import { findVisibleStation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Deactivate a station",
  description:
    "Deactivates a station instead of deleting it. Its status becomes `inactive`, and its cells, photos, comments and history are kept. " +
    "`GET /stations` leaves inactive stations out unless you ask for them with `statuses`, but you can still get one by id, " +
    "and `PATCH /stations/{id}` with `station.status` reactivates it. " +
    "A station that stays inactive and unchanged for six months is deleted permanently, along with its cells.",
  params: stationParamsSchema,
  response: { 204: noContentSchema.describe("The station is inactive now. Also returned if it already was, in which case nothing changes.") },
};
const errorReasons = {
  403:
    "A permission is missing, or your editor access does not cover the station's country or region. " +
    "Editors also get this response when the station does not exist.",
  404: "The station does not exist.",
};
type RequestData = { Params: z.infer<typeof stationParamsSchema> };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<EmptyResponse>) {
  if (!(await hasStaffPermission(req, { stations: ["delete"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const station = await findVisibleStation(req, req.params.id);
  if (station.status !== "inactive") await deactivateStation(req, station.id);

  return res.status(204).send();
}

const deleteStation: Route<RequestData, void> = {
  url: "/stations/:id",
  method: "DELETE",
  config: { permissions: ["delete:stations"], scope: defineScope<RequestData>((req) => ({ stationIds: [req.params.id] })), errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteStation;
