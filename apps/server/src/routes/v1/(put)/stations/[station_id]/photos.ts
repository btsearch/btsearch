import { locationPhotos, stationPhotoSelections } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import {
  auditContextFromRequest,
  loadPhotoSelectionSnapshots,
  logPhotoSelectionChanges,
  runAuditedOperation,
} from "../../../../../services/audit/index.js";

const schemaRoute = {
  params: z.object({ station_id: z.coerce.number() }),
  body: z.object({
    selected: z.array(z.number()).max(50),
    main_id: z.number().nullable().optional(),
  }),
  response: {
    200: z.object({ data: z.object({ updated: z.number() }) }),
  },
};

type ReqParams = { Params: { station_id: number } };
type ReqBody = { Body: { selected: number[]; main_id?: number | null } };
type RequestData = ReqParams & ReqBody;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<{ updated: number }>>) {
  const { station_id } = req.params;
  const { selected, main_id } = req.body;
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  if (selected.length > 0) {
    const validPhotos = await db
      .select({ id: locationPhotos.id })
      .from(locationPhotos)
      .where(and(inArray(locationPhotos.id, selected), eq(locationPhotos.location_id, station.location_id!)));
    if (validPhotos.length !== selected.length)
      throw new ErrorResponse("BAD_REQUEST", { message: "Some photos do not belong to this station's location" });
  }

  await runAuditedOperation(auditContextFromRequest(req), { kind: "station.photos" }, async (tx, audit) => {
    const previousSelections = await loadPhotoSelectionSnapshots(tx, [station_id]);
    await tx.delete(stationPhotoSelections).where(eq(stationPhotoSelections.station_id, station_id));

    if (selected.length > 0) {
      const mainId = main_id !== null && main_id !== undefined && selected.includes(main_id) ? main_id : null;

      await tx.insert(stationPhotoSelections).values(
        selected.map((location_photo_id) => ({
          station_id,
          location_photo_id,
          is_main: location_photo_id === mainId,
        })),
      );
    }

    await logPhotoSelectionChanges(audit, previousSelections);
  });

  return res.send({ data: { updated: selected.length } });
}

const putStationPhotos: Route<RequestData, { updated: number }> = {
  url: "/stations/:station_id/photos",
  method: "PUT",
  schema: schemaRoute,
  config: { permissions: ["update:stations"] },
  handler,
};

export default putStationPhotos;
