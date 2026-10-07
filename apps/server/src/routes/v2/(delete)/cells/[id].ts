import { cellParamsSchema, noContentSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { defineScope } from "../../../../features/access/scope.js";
import { findListedCell } from "../../../../features/cells/read.js";
import { applyStationChange } from "../../../../features/stations/edit.js";
import { findVisibleStation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a cell",
  description:
    "Deletes a cell. If it was the last cell of an active station, the station goes back to awaiting cells. " +
    "Users who watch the station are notified.",
  params: cellParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403:
    "A permission is missing, or your editor access does not cover the cell's station. " +
    "Editors also get this response when the cell does not exist.",
  404: "The cell does not exist.",
};
type RequestData = { Params: z.infer<typeof cellParamsSchema> };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;
  const row = await findListedCell(id);
  await findVisibleStation(req, row.station.id);

  await applyStationChange(req, { action: "update", stationId: row.station.id, cells: [{ action: "delete", id }] }, "cells.delete");
  return res.status(204).send();
}

const deleteCell: Route<RequestData, void> = {
  url: "/cells/:id",
  method: "DELETE",
  config: { permissions: ["delete:cells"], scope: defineScope<RequestData>((req) => ({ cellIds: [req.params.id] })), errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteCell;
