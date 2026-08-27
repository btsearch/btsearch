import { cells, stations } from "@openbts/drizzle";
import { count, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import { queueStationCellsChangedNotification } from "../../../../utils/notifications/stationCellChanges.js";
import { assertCanDeleteCells } from "../../../../utils/stationStatus.js";

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
    await db.transaction(async (tx) => {
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

      await tx.delete(cells).where(inArray(cells.id, ids));

      /* eslint-disable no-await-in-loop */
      for (const stationId of uniqueStationIds) {
        await createAuditLog(
          {
            action: "cells.delete",
            table_name: "cells",
            record_id: null,
            old_values: { cells: foundCells.filter((cell) => cell.station_id === stationId) },
            new_values: null,
            metadata: { station_id: stationId },
          },
          req,
          tx,
        );
      }
      /* eslint-enable no-await-in-loop */

      /* eslint-disable no-await-in-loop */
      for (const stationId of uniqueStationIds) {
        await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, stationId));
        await createAuditLog(
          {
            action: "stations.update",
            table_name: "stations",
            record_id: stationId,
            new_values: { updatedAt: new Date() },
            metadata: { reason: "cells.delete" },
          },
          req,
          tx,
        );
      }
      /* eslint-enable no-await-in-loop */
    });

    for (const [stationId, removed] of deletedCountByStationId) queueStationCellsChangedNotification({ stationId, counts: { removed } });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw (new ErrorResponse("FAILED_TO_DELETE"), { cause: error });
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
