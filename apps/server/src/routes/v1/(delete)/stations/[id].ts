import { stations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, IdParams, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import { assertStationStatusTransition, stationStatusUpdate } from "../../../../services/stations/status.js";

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
};
async function handler(req: FastifyRequest<IdParams>, res: ReplyPayload<EmptyResponse>) {
  const { id: stationId } = req.params;

  if (Number.isNaN(stationId)) throw new ErrorResponse("INVALID_QUERY");

  const station = await db.query.stations.findFirst({
    where: {
      id: stationId,
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  if (station.status === "inactive") return res.status(204).send();

  // assertStationStatusTransition(station.status, "inactive");

  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(stations).set(stationStatusUpdate("inactive")).where(eq(stations.id, stationId)).returning();
      if (!updated) throw new ErrorResponse("FAILED_TO_DELETE");

      await createAuditLog(
        {
          action: "stations.delete",
          table_name: "stations",
          record_id: stationId,
          old_values: station,
          new_values: updated,
        },
        req,
        tx,
      );
    });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
}

const deleteStation: Route<IdParams, void> = {
  url: "/stations/:id",
  method: "DELETE",
  schema: schemaRoute,
  config: { permissions: ["delete:stations"] },
  handler,
};

export default deleteStation;
