import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { findSiblingStationIdByEnbid } from "../../../../../../features/stations/networksSibling.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const responseSchema = z.object({
  networks_id: z.int().nullable(),
  networks_name: z.string().nullable(),
  mno_name: z.string().nullable(),
});

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({ data: responseSchema }),
  },
};

type ReqParams = { Params: { station_id: number } };
type ResponseData = z.infer<typeof responseSchema>;

const empty: ResponseData = { networks_id: null, networks_name: null, mno_name: null };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const { station_id } = req.params;

  const station = await db.query.stations.findFirst({
    where: { id: station_id },
    with: { operator: true },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const siblingStationId = await findSiblingStationIdByEnbid(station_id, station.location_id, station.operator?.mnc);
  if (siblingStationId === null) return res.send({ data: empty });

  const ids = await db.query.extraIdentificators.findFirst({ where: { station_id: siblingStationId } });
  if (!ids) return res.send({ data: empty });

  return res.send({ data: { networks_id: ids.networks_id, networks_name: ids.networks_name, mno_name: ids.mno_name } });
}

const getSiblingExtraIdentifiers: Route<ReqParams, ResponseData> = {
  url: "/stations/:station_id/extra-identifiers/sibling",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getSiblingExtraIdentifiers;
