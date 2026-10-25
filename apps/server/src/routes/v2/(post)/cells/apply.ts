import { cellApplyAnswerSchema, cellApplyConflictSchema, cellApplyManySchema } from "@openbts/shared/contract";
import type { CellApply, CellApplyAnswer } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { defineScope } from "../../../../features/access/scope.js";
import { applyCells } from "../../../../features/analyzer/apply.js";
import { findListedCells, serializeCells } from "../../../../features/cells/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create and update cells on several stations",
  description:
    "A failed request changes nothing. " +
    "The first cell turns a station that is awaiting cells into an active one, and users who watch a station are notified. " +
    "An update that names only the cell's `id` confirms that cell and changes nothing else.\n\n" +
    "To fix flags of `GET /observed/flags`, list them in the station's `observationFlagIds`. " +
    "They close when the request succeeds, the answer lists them in `closedObservationFlagIds`, and the audit operation names them. " +
    "If one of them closed in the meantime, the whole request fails with 409. " +
    "A station with flags needs `measurements` in its country's `tools` instead of `analyzer`.\n\n" +
    "When a request fails because of one station, `details[0].field` in the error is that station's position in the request, " +
    "starting at 0. For an invalid value it is the full path, such as `0/cells/1/pci` for station 0, cell 1.",
  body: cellApplyManySchema,
  response: {
    200: cellApplyAnswerSchema,
  },
};
const errorReasons = {
  400:
    "A cell cannot be saved as sent. For example, its band is not in the country's band plan " +
    "or belongs to another technology, the same cell identifiers appear twice in the request, " +
    "or the changes for one station contain more than one new LTE TAC in a country where all LTE cells of a station share one TAC. " +
    "Also returned when a flag in `observationFlagIds` is not about the station it is listed under, " +
    "or is of a kind this endpoint does not apply. " +
    "The `message` tells you what is wrong.",
  403:
    "Your editor access does not cover every station in the request. " +
    "Editors also get this response when none of the stations exist. This response does not say which station it is about. " +
    "Also returned when you name flags without the `moderate:observations` permission. " +
    "With `FEATURE_DISABLED`, a station's country has `analyzer` off in its `tools`, or `measurements` off for a station with flags.",
  404:
    "One of the stations or of the flags in `observationFlagIds` does not exist, " +
    "or a cell you want to update does not belong to the station it is listed under.",
  409:
    "`DUPLICATE_ENTRY` when an active station already has a cell with the same identity on one of the cell's networks: " +
    "`lac` and `cid` for GSM, `rnc` and `cid` for UMTS, `enbid` and `clid` for LTE, `nci` for NR. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band. " +
    "`CONFLICT` when a flag you name is no longer open, with one entry of the kind `flagClosed` in `details` for each such flag.",
};
const errorBodies = {
  409: z.object({
    errors: z
      .array(
        z.discriminatedUnion("code", [
          z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(cellApplyConflictSchema) }),
          z.object({ code: z.enum(["DUPLICATE_ENTRY", "DUPLICATE_REQUEST"]), message: z.string() }),
        ]),
      )
      .min(1),
  }),
};
type RequestData = { Body: CellApply[] };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<CellApplyAnswer>>) {
  const { operationId, stations } = await applyCells(req, req.body);
  const cells = await serializeCells(await findListedCells(stations.flatMap((station) => station.cellIds)));
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));

  return res.send({
    data: stations.map(({ stationId, cellIds, closedFlagIds }) => ({
      stationId,
      cells: cellIds.flatMap((cellId) => cellsById.get(cellId) ?? []),
      closedObservationFlagIds: closedFlagIds,
    })),
    operationId,
  });
}

const applyCellsRoute: Route<RequestData, CellApplyAnswer> = {
  url: "/cells/apply",
  method: "POST",
  config: {
    permissions: ["create:cells", "update:cells"],
    scope: defineScope<RequestData>((req) => ({ stationIds: req.body.map((item) => item.stationId) })),
    errorBodies,
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default applyCellsRoute;
