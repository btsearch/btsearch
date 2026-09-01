import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../../../services/auditLog.service.js";
import { queueStationCellsChangedNotification } from "../../../../../../services/notifications/stationCellChanges.js";
import { assertCanDeleteCells } from "../../../../../../services/stations/status.js";

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    cell_id: z.coerce.number<number>(),
  }),
};
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { station_id, cell_id } = req.params;

  if (Number.isNaN(station_id) || Number.isNaN(cell_id)) throw new ErrorResponse("INVALID_QUERY");

  const station = await db.query.stations.findFirst({
    where: {
      id: station_id,
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const cell = await db.query.cells.findFirst({
    where: {
      AND: [{ id: { eq: cell_id } }, { station_id: { eq: station_id } }],
    },
  });
  if (!cell) throw new ErrorResponse("NOT_FOUND");

  const currentCellCount = await db.$count(cells, eq(cells.station_id, station_id));
  assertCanDeleteCells(station, currentCellCount - 1);

  try {
    await db.transaction(async (tx) => {
      switch (cell.rat) {
        case "GSM":
          await tx.delete(gsmCells).where(eq(gsmCells.cell_id, cell.id));
          break;
        case "UMTS":
          await tx.delete(umtsCells).where(eq(umtsCells.cell_id, cell.id));
          break;
        case "LTE":
          await tx.delete(lteCells).where(eq(lteCells.cell_id, cell.id));
          break;
        case "NR":
          await tx.delete(nrCells).where(eq(nrCells.cell_id, cell.id));
          break;
      }

      await tx.delete(cells).where(eq(cells.id, cell_id));
    });

    await createAuditLog(
      {
        action: "cells.delete",
        table_name: "cells",
        record_id: cell_id,
        old_values: cell,
        metadata: { station_id },
      },
      req,
    );

    await db.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
    await createAuditLog(
      {
        action: "stations.update",
        table_name: "stations",
        record_id: station_id,
        old_values: { updatedAt: station.updatedAt },
        new_values: { updatedAt: new Date() },
        metadata: { reason: "cells.delete" },
      },
      req,
    );

    queueStationCellsChangedNotification({ stationId: station_id, counts: { removed: 1 } });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
}

const deleteCell: Route<ReqParams, void> = {
  url: "/stations/:station_id/cells/:cell_id",
  method: "DELETE",
  schema: schemaRoute,
  config: { permissions: ["delete:stations", "delete:cells"] },
  handler,
};

export default deleteCell;
