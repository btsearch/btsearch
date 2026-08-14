import type { FastifyRequest } from "fastify/types/request.js";
import { SI2PEMClient } from "si2pem-reader";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const si2pem = new SI2PEMClient();

const tiltRangeSchema = z.object({
  minimum: z.number(),
  maximum: z.number(),
});

const antennaSchema = z.object({
  label: z.string().nullable(),
  technology: z.string().nullable(),
  frequencyMHz: z.number(),
  tiltRange: tiltRangeSchema.nullable(),
  measuredTilt: z.number().nullable(),
  rowNumber: z.number().int().nullable(),
  pageNumber: z.number().int().nonnegative(),
  antenna: z.object({
    model: z.string().nullable(),
    manufacturer: z.string().nullable(),
    mountedHeight: z.number(),
    azimuth: z.number().nullable(),
  }),
  eirp: z.number().nullable(),
  bandIndex: z.number().int().nonnegative(),
});

const schemaRoute = {
  params: z.object({
    station_id: z.string().trim().min(1),
  }),
  querystring: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    report_url: z.url(),
  }),
  response: {
    200: z.object({
      data: z.array(antennaSchema),
    }),
  },
};

type ReqParams = {
  Params: { station_id: string };
  Querystring: { lat: number; lng: number; report_url: string };
};
type ResponseData = z.infer<typeof antennaSchema>[];

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const { lat, lng, report_url } = req.query;
  const bbox: [number, number, number, number] = [lng - 0.02, lat - 0.02, lng + 0.02, lat + 0.02];

  try {
    const reports = await si2pem.findLaboratoryReports({ stationIdentity: station_id, bbox, count: 200 });
    const requestedUrl = new URL(report_url).href;
    const report = reports.find((candidate) => new URL(candidate.url, si2pem.endpoints.origin).href === requestedUrl);
    if (report === undefined) throw new ErrorResponse("NOT_FOUND");

    const data = await report.readAntennas();
    return res.send({ data });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getPemAntennasByStationId: Route<ReqParams, ResponseData> = {
  url: "/pem/:station_id/antennas",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPemAntennasByStationId;
