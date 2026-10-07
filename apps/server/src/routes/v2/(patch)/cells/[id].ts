import { cellParamsSchema, cellQuerySchema, cellUpdateSchema, listedCellSchema } from "@openbts/shared/contract";
import type { CellQuery, CellUpdate, ListedCell } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { defineScope } from "../../../../features/access/scope.js";
import { findListedCell, serializeCell } from "../../../../features/cells/read.js";
import { applyStationChange } from "../../../../features/stations/edit.js";
import { findVisibleStation } from "../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a cell",
  description:
    "Updates the fields you send and returns the cell. If you send `stationId`, the cell moves to that station. " +
    "A station that is left without cells goes back to awaiting cells, and the first cell turns a station that is awaiting cells " +
    "into an active one. Users who watch the cell's station are notified. " +
    "As an editor you need access to the cell's station and to the station it moves to.",
  params: cellParamsSchema,
  querystring: cellQuerySchema,
  body: cellUpdateSchema,
  response: {
    200: z.object({
      data: listedCellSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request did not pass validation, or the cell cannot be updated as sent. For example, a field does not apply " +
    "to the cell's technology, its band is not in the country's band plan or belongs to another technology, " +
    "or `sectorId` is not one of the station's sectors. The `message` tells you what is wrong.",
  403:
    "A permission is missing, or your editor access does not cover the cell's station or the station it moves to. " +
    "Editors can also get this response when the cell does not exist.",
  404: "The cell does not exist, or the station in `stationId` does not exist.",
  409:
    "The operator already has a GSM cell with the same `lac` and `cid`, a UMTS cell with the same `rnc` and `cid`, " +
    "or an LTE cell on an active station with the same `enbid` and `clid`. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band. " +
    "When you move a cell, both checks apply to the station it moves to.",
};
type RequestData = { Params: z.infer<typeof cellParamsSchema>; Querystring: CellQuery; Body: CellUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ListedCell>>) {
  const { id } = req.params;
  const row = await findListedCell(id);
  await findVisibleStation(req, row.station.id);

  await applyStationChange(
    req,
    { action: "update", stationId: row.station.id, cells: [{ action: "update", id, ...req.body }] },
    "cells.update",
    ([_cells, _index, ...path]) => path,
  );

  return res.send({ data: await serializeCell(await findListedCell(id), req.query.include) });
}

const updateCell: Route<RequestData, ListedCell> = {
  url: "/cells/:id",
  method: "PATCH",
  config: {
    permissions: ["update:cells"],
    scope: defineScope<RequestData>((req) => ({
      cellIds: [req.params.id],
      stationIds: req.body.stationId === undefined ? [] : [req.body.stationId],
    })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateCell;
