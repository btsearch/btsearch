import { observedCellParamsSchema, observedCellQuerySchema, observedCellRecordSchema } from "@openbts/shared/contract";
import type { ObservedCellQuery, ObservedCellRecord } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { assertObservationsOn } from "../../../../../features/observed/access.js";
import { readObservedCell } from "../../../../../features/observed/cells/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an observed cell",
  description: "Copies are returned too, with `copyOfObservedCellId` set.",
  params: observedCellParamsSchema,
  querystring: observedCellQuerySchema,
  response: {
    200: z.object({
      data: observedCellRecordSchema,
    }),
  },
};
const errorReasons = {
  403: "Observed data is switched off and you are not an administrator.",
  404: "No cell you may see has this id.",
};
type RequestData = { Params: z.infer<typeof observedCellParamsSchema>; Querystring: ObservedCellQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ObservedCellRecord>>) {
  res.header("Cache-Control", "private, no-store");
  await assertObservationsOn(req);

  return res.send({ data: await readObservedCell(req, req.params.id, req.query.include) });
}

const getObservedCell: Route<RequestData, ObservedCellRecord> = {
  url: "/observed/cells/:id",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservedCell;
