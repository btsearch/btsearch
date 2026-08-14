import type { FastifyRequest } from "fastify/types/request.js";
import { SI2PEMClient } from "si2pem-reader";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const si2pem = new SI2PEMClient();

const azimuthSchema = z.object({
  azimuth: z.number().int().min(0).max(360),
});

const schemaRoute = {
  params: z.object({
    station_id: z.string().trim().min(1),
  }),
  querystring: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }),
  response: {
    200: z.object({
      data: z.array(azimuthSchema),
    }),
  },
};

type ReqParams = { Params: { station_id: string }; Querystring: { lat: number; lng: number } };
type ResponseData = z.infer<typeof azimuthSchema>[];

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const { lat, lng } = req.query;
  const bbox: [number, number, number, number] = [lng - 0.02, lat - 0.02, lng + 0.02, lat + 0.02];

  try {
    const report = await si2pem.getLatestLaboratoryReport({ stationIdentity: station_id, bbox });
    if (!report) return res.send({ data: [] });

    const antennas = await report.readAntennas();
    const seen = new Set<number>();
    const data: ResponseData = [];

    for (const { antenna } of antennas) {
      const { azimuth } = antenna;
      if (azimuth === null) continue;
      const roundedAzimuth = Math.round(azimuth);
      if (seen.has(roundedAzimuth)) continue;
      seen.add(roundedAzimuth);
      data.push({ azimuth: roundedAzimuth });
    }

    return res.send({ data });
  } catch (error) {
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getPemAzimuthsByStationId: Route<ReqParams, ResponseData> = {
  url: "/pem/:station_id/azimuths",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getPemAzimuthsByStationId;
