import type { FastifyRequest } from "fastify/types/request.js";
import { createHash } from "node:crypto";
import { SI2PEMClient } from "si2pem-reader";
import { parseAntennaReport } from "si2pem-reader/reports";
import { z } from "zod/v4";

import redis from "../../../../../database/redis.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const si2pem = new SI2PEMClient();
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const tiltRangeSchema = z.object({
  minimum: z.number(),
  maximum: z.number(),
});

const antennaBandSchema = z.object({
  label: z.string().nullable(),
  rat: z.string().nullable(),
  value: z.number(),
  eirp: z.number().nullable(),
  tiltRange: tiltRangeSchema.nullable(),
  measuredTilt: z.number().nullable(),
});

const antennaSchema = z.object({
  rowNumber: z.number().int().nullable(),
  pageNumber: z.number().int().nonnegative(),
  antenna: z.object({
    model: z.string().nullable(),
    manufacturer: z.string().nullable(),
    mountedHeight: z.number(),
    azimuth: z.number().nullable(),
  }),
  totalEirp: z.number().nullable(),
  bands: z.array(antennaBandSchema),
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
    const requestedUrl = new URL(report_url).href;
    const cacheKey = `pem:antennas:v1:${createHash("sha256")
      .update(JSON.stringify([station_id, lat, lng, requestedUrl]))
      .digest("hex")}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.send(JSON.parse(cached) as { data: ResponseData });

    const reports = await si2pem.findLaboratoryReports({ stationIdentity: station_id, bbox, count: 200 });
    const report = reports.find((candidate) => new URL(candidate.url, si2pem.endpoints.origin).href === requestedUrl);
    if (report === undefined) throw new ErrorResponse("NOT_FOUND");

    const pdf = await si2pem.downloadReport(report.url);
    const { rows: data } = await parseAntennaReport(pdf, { report, expectedStationIdentity: station_id });
    const response = { data };
    await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(response));
    return res.send(response);
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
