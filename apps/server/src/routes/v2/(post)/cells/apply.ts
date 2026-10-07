import { cellApplyAnswerSchema, cellApplyManySchema } from "@openbts/shared/contract";
import type { CellApply, CellApplyAnswer } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { defineScope } from "../../../../features/access/scope.js";
import { applyCells } from "../../../../features/analyzer/apply.js";
import { findListedCells, serializeCells } from "../../../../features/cells/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create and update cells on several stations",
  description:
    "Creates and updates cells on up to 50 stations in one request. Use this to save what a log analysis confirmed. " +
    "Everything is saved in a single transaction, so a failed request changes nothing. " +
    "The first cell turns a station that is awaiting cells into an active one, and users who watch a station are notified. " +
    "As an editor you need access to every station in the request.\n\n" +
    "Every cell you list is marked as confirmed, so an update that names only the cell's `id` confirms that cell and changes nothing else. " +
    "The whole request is recorded as one audit operation, and `operationId` is its id.\n\n" +
    "When a request fails because of one station, `details[0].field` in the error is that station's position in the request, " +
    "starting at 0. For an invalid value it is the full path, such as `0/cells/1/pci` for station 0, cell 1.",
  body: cellApplyManySchema,
  response: {
    200: cellApplyAnswerSchema,
  },
};
const errorReasons = {
  400:
    "The request did not pass validation, or a cell cannot be saved as sent. For example, its band is not in the country's band plan " +
    "or belongs to another technology, the same cell identifiers appear twice in the request, " +
    "or the changes for one station contain more than one new LTE TAC. The `message` tells you what is wrong.",
  403:
    "A permission is missing, or your editor access does not cover every station in the request. " +
    "Editors also get this response when none of the stations exist. This response does not say which station it is about.",
  404: "One of the stations does not exist, or a cell you want to update does not belong to the station it is listed under.",
  409:
    "The operator already has a GSM cell with the same `lac` and `cid`, a UMTS cell with the same `rnc` and `cid`, " +
    "or an LTE cell on an active station with the same `enbid` and `clid`. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band.",
};
type RequestData = { Body: CellApply[] };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<CellApplyAnswer>>) {
  const { operationId, stations } = await applyCells(req, req.body);
  const cells = await serializeCells(await findListedCells(stations.flatMap((station) => station.cellIds)));
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));

  return res.send({
    data: stations.map(({ stationId, cellIds }) => ({ stationId, cells: cellIds.flatMap((cellId) => cellsById.get(cellId) ?? []) })),
    operationId,
  });
}

const applyCellsRoute: Route<RequestData, CellApplyAnswer> = {
  url: "/cells/apply",
  method: "POST",
  config: {
    permissions: ["create:cells", "update:cells"],
    scope: defineScope<RequestData>((req) => ({ stationIds: req.body.map((item) => item.stationId) })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default applyCellsRoute;
