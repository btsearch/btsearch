import { stationSectors } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { findSharedSiblingIds } from "../../../../../../features/stations/sharedSiblings.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const sectorSchema = createSelectSchema(stationSectors).omit({ station_id: true });

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({ data: z.array(sectorSchema) }),
  },
};

type ReqParams = { Params: { station_id: number } };
type ResponseData = z.infer<typeof sectorSchema>[];

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const { station_id } = req.params;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const [siblingStationId] = await findSharedSiblingIds(
    { id: station.id, locationId: station.location_id, operatorId: station.operator_id },
    { sameEnb: true },
  );
  if (siblingStationId === undefined) return res.send({ data: [] });

  const sectors = await db.query.stationSectors.findMany({
    where: { station_id: siblingStationId },
    columns: { station_id: false },
    orderBy: { id: "asc" },
  });

  return res.send({ data: sectors });
}

const getSiblingSectors: Route<ReqParams, ResponseData> = {
  url: "/stations/:station_id/sectors/sibling",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getSiblingSectors;
