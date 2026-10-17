import { stations } from "@openbts/drizzle";
import { stationParamsSchema, stationQuerySchema, stationSchema } from "@openbts/shared/contract";
import type { Station, StationQuery } from "@openbts/shared/contract";
import { inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { findVisibleStation, serializeStations } from "../../../../../features/stations/read.js";
import { findSharedSiblingIds } from "../../../../../features/stations/sharedSiblings.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List a station's siblings",
  description:
    "Returns the stations that share a site with this one on a shared network. " +
    "A sibling is a station at the same location whose operator is another member of a shared network this station's operator belongs to, " +
    "and which has an LTE cell with the same eNBID as one of this station's LTE cells. " +
    "A country can have its own rule for when two eNBIDs count as the same. " +
    "Active siblings come first, then the others, each group ordered by `id`.",
  params: stationParamsSchema,
  querystring: stationQuerySchema,
  response: {
    200: z.object({
      data: z.array(stationSchema),
    }),
  },
};
type RequestData = { Params: z.infer<typeof stationParamsSchema>; Querystring: StationQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Station[]>>) {
  const station = await findVisibleStation(req, req.params.id);
  const siblingIds = await findSharedSiblingIds(
    { id: station.id, locationId: station.location_id, operatorId: station.operator_id },
    { sameEnb: true },
  );
  const rows = siblingIds.length > 0 ? await db.select().from(stations).where(inArray(stations.id, siblingIds)) : [];
  const siblings = siblingIds.flatMap((id) => rows.find((row) => row.id === id) ?? []);

  return res.send({ data: await serializeStations(siblings, req.query.include) });
}

const getStationSiblings: Route<RequestData, Station[]> = {
  url: "/stations/:id/siblings",
  method: "GET",
  config: {
    permissions: ["read:stations"],
    allowGuestAccess: true,
  },
  schema: schemaRoute,
  handler,
};

export default getStationSiblings;
