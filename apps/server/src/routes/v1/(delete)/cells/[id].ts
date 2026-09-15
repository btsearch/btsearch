import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, IdParams, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, loadCellSnapshot, runAuditedOperation } from "../../../../services/audit/index.js";
import { queueStationCellsChangedNotification } from "../../../../services/notifications/stationCellChanges.js";
import { assertCanDeleteCells } from "../../../../services/stations/status.js";

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
};

async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const cell = await db.query.cells.findFirst({
    where: {
      id: id,
    },
  });
  if (!cell) throw new ErrorResponse("NOT_FOUND");

  const station = await db.query.stations.findFirst({ where: { id: cell.station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  const currentCellCount = await db.$count(cells, eq(cells.station_id, cell.station_id));
  assertCanDeleteCells(station, currentCellCount - 1);

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "cells.delete" }, async (tx, audit) => {
      const snapshot = await loadCellSnapshot(tx, cell.id);
      if (!snapshot) throw new ErrorResponse("NOT_FOUND");

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

      await tx.delete(cells).where(eq(cells.id, cell.id));
      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, cell.station_id));
      await audit.log({
        entity: "cells",
        op: "delete",
        recordId: cell.id,
        stationId: cell.station_id,
        old: snapshot,
        new: null,
      });
    });

    queueStationCellsChangedNotification({ stationId: cell.station_id, counts: { removed: 1 } });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
}

const deleteCell: Route<IdParams, void> = {
  url: "/cells/:id",
  method: "DELETE",
  config: { permissions: ["delete:cells"] },
  schema: schemaRoute,
  handler,
};

export default deleteCell;
