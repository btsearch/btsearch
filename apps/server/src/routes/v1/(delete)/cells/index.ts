import { cells, stations } from "@openbts/drizzle";
import { count, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, loadCellSnapshots, runAuditedOperation } from "../../../../services/audit/index.js";
import { queueStationCellsChangedNotification } from "../../../../services/notifications/stationCellChanges.js";
import { assertCanDeleteCells } from "../../../../services/stations/status.js";

const schemaRoute = {
  body: z.object({
    ids: z.array(z.number().int().positive()).min(1),
  }),
};

type ReqBody = { Body: z.infer<typeof schemaRoute.body> };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<EmptyResponse>) {
  const { ids } = req.body;

  const foundCells = await db.query.cells.findMany({
    where: { id: { in: ids } },
  });

  if (foundCells.length !== ids.length) throw new ErrorResponse("NOT_FOUND");

  const uniqueStationIds = [...new Set(foundCells.map((c) => c.station_id))];
  const stationRows = await db.query.stations.findMany({ where: { id: { in: uniqueStationIds } } });
  if (stationRows.length !== uniqueStationIds.length) throw new ErrorResponse("NOT_FOUND");
  const deletedCountByStationId = new Map<number, number>();
  for (const cell of foundCells) deletedCountByStationId.set(cell.station_id, (deletedCountByStationId.get(cell.station_id) ?? 0) + 1);

  try {
    await runAuditedOperation(auditContextFromRequest(req), { kind: "cells.delete" }, async (tx, audit) => {
      const cellCounts = await tx
        .select({ stationId: cells.station_id, total: count() })
        .from(cells)
        .where(inArray(cells.station_id, uniqueStationIds))
        .groupBy(cells.station_id);
      const cellCountByStationId = new Map(cellCounts.map(({ stationId, total }) => [stationId, total]));

      for (const station of stationRows) {
        const currentCellCount = cellCountByStationId.get(station.id) ?? 0;
        const deletedForStation = foundCells.filter((cell) => cell.station_id === station.id).length;
        assertCanDeleteCells(station, currentCellCount - deletedForStation);
      }

      const snapshots = await loadCellSnapshots(tx, ids);
      if (snapshots.size !== ids.length) throw new ErrorResponse("NOT_FOUND");

      await tx.delete(cells).where(inArray(cells.id, ids));
      await tx.update(stations).set({ updatedAt: new Date() }).where(inArray(stations.id, uniqueStationIds));
      await audit.logMany(
        ids.map((id) => {
          const snapshot = snapshots.get(id);
          if (!snapshot) throw new ErrorResponse("NOT_FOUND");
          return {
            entity: "cells",
            op: "delete",
            recordId: id,
            stationId: snapshot.station_id,
            old: snapshot,
            new: null,
          };
        }),
      );
    });

    for (const [stationId, removed] of deletedCountByStationId) queueStationCellsChangedNotification({ stationId, counts: { removed } });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
}

const deleteCellsBatch: Route<ReqBody, void> = {
  url: "/cells",
  method: "DELETE",
  config: { permissions: ["delete:cells"] },
  schema: schemaRoute,
  handler,
};

export default deleteCellsBatch;
