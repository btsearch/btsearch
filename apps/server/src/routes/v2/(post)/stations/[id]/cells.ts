import { cellCreateManySchema, cellQuerySchema, listedCellSchema, stationParamsSchema } from "@openbts/shared/contract";
import type { CellQuery, ListedCell, NewCellInput } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { defineScope } from "../../../../../features/access/scope.js";
import { findListedCells, serializeCells } from "../../../../../features/cells/read.js";
import { applyStationChange } from "../../../../../features/stations/edit.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Add cells to a station",
  description:
    "Creates one or more cells on a station. Either all of them are created, or none. " +
    "The first cell turns a station that is awaiting cells into an active one, and users who watch the station are notified. " +
    "Use `sectorId` to put a cell on one of the station's sectors. " +
    "`sectorKey` does not work here, because this endpoint cannot create sectors.",
  params: stationParamsSchema,
  querystring: cellQuerySchema,
  body: cellCreateManySchema,
  response: {
    201: z.object({
      data: z.array(listedCellSchema).describe("The new cells, in the order they were sent"),
    }),
  },
};
const errorReasons = {
  400:
    "The request did not pass validation, or a cell cannot be created as sent. For example, its band is not in the country's band plan " +
    "or belongs to another technology, or `sectorId` is not one of the station's sectors. The `message` tells you what is wrong.",
  403:
    "A permission is missing, or your editor access does not cover the station's country or region. " +
    "Editors also get this response when the station does not exist.",
  404: "The station does not exist.",
  409:
    "The operator already has a GSM cell with the same `lac` and `cid`, a UMTS cell with the same `rnc` and `cid`, " +
    "or an LTE cell on an active station with the same `enbid` and `clid`. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band.",
};
type RequestData = { Params: z.infer<typeof stationParamsSchema>; Querystring: CellQuery; Body: NewCellInput[] };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ListedCell[]>>) {
  const { id } = req.params;
  await findVisibleStation(req, id);
  const cells = req.body.map((cell) => ({ action: "create" as const, ...cell }));
  const applied = await applyStationChange(req, { action: "update", stationId: id, cells }, "cells.create", ([_cells, ...path]) => path);

  return res.status(201).send({ data: await serializeCells(await findListedCells(applied.cellChanges.added), req.query.include) });
}

const createStationCells: Route<RequestData, ListedCell[]> = {
  url: "/stations/:id/cells",
  method: "POST",
  config: { permissions: ["create:cells"], scope: defineScope<RequestData>((req) => ({ stationIds: [req.params.id] })), errorReasons },
  schema: schemaRoute,
  handler,
};

export default createStationCells;
