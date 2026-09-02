import type { FastifyRequest } from "fastify/types/request.js";
import { SI2PEMClient, type SI2PEMMeasureProperties, SI2PEM_WMS_LAYERS, escapeCqlLiteral, si2pemDateToISO } from "si2pem-reader";
import { z } from "zod/v4";

import redis from "../../../../database/redis.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const CACHE_TTL = 86400; // 24h
const si2pem = new SI2PEMClient();

const MNC_TO_ENTITY: Record<number, string> = {
  26001: "Polkomtel Sp. z o.o.",
  26002: "T-Mobile Polska S.A.",
  26003: "Orange Polska S.A.",
  26006: "P4 Sp. z o.o.",
};

type Params = { Params: { station_id: string }; Querystring: { lat: number; lng: number; operator: number } };

const mapMeasurement = z.object({
  document_url: z.url(),
  lab_name: z.string(),
});

const searchMeasurement = z.object({
  document_url: z.url(),
  installation_document: z.url(),
  lab_name: z.string(),
});

const PemReportResponse = z.object({
  station_id: z.string(),
  source: z.enum(["map", "search"]),
  date: z.iso.datetime({ offset: true }),
  type: z.enum(["map_measurement", "search_measurement"]),
  antenna_data_available: z.boolean(),
  details: z.union([mapMeasurement, searchMeasurement]),
});
type PemReport = z.infer<typeof PemReportResponse>;

const schemaRoute = {
  params: z.object({
    station_id: z.string(),
  }),
  querystring: z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    operator: z.coerce.number(),
  }),
  response: {
    200: z.object({
      data: z.array(PemReportResponse),
    }),
  },
};

async function fetchInstallations(stationId: string, entityName: string): Promise<PemReport[]> {
  const json = await si2pem.listInstallations({ baseStation: stationId, entity: entityName, page: 1, pageSize: 25 });
  if (!json.count || !json.results?.length) return [];

  const normalized = json.results.flatMap((result) => {
    const url = result.report_file;
    if (!url || result.base_station?.identity_name !== stationId) return [];
    const date = si2pemDateToISO(result.published_at);
    if (!date) return [];
    return [{ date, result, url }];
  });
  normalized.sort((a, b) => b.date.localeCompare(a.date));

  const seen = new Set<string>();
  const reports: PemReport[] = [];
  for (const { date, result, url } of normalized) {
    if (seen.has(url)) continue;
    seen.add(url);
    reports.push({
      station_id: result.base_station?.identity_name ?? "",
      source: "search",
      date,
      type: "search_measurement",
      antenna_data_available: false,
      details: {
        document_url: url,
        installation_document: result.installation_file ?? "",
        lab_name: result.entity,
      },
    });
  }

  return reports;
}

type StationMeasureProperties = SI2PEMMeasureProperties & {
  identity_names: string | null;
  url: string | null;
  date: string;
  year: number;
  source: string;
};

function parseWmsReports(features: { properties: StationMeasureProperties }[]): PemReport[] {
  const normalized = features.flatMap((feature) => {
    const { date: rawDate, identity_names, measure_type, source } = feature.properties;
    const date = si2pemDateToISO(rawDate);
    const url = feature.properties.url ?? null;
    if (!date || !url) return [];
    return [{ date, identity_names, measure_type, source, url }];
  });
  normalized.sort((a, b) => b.date.localeCompare(a.date));

  const seen = new Set<string>();
  const reports: PemReport[] = [];
  for (const { date, identity_names, measure_type, source, url } of normalized) {
    if (seen.has(url)) continue;
    seen.add(url);
    reports.push({
      station_id: identity_names ?? "",
      source: "map",
      date,
      type: "map_measurement",
      antenna_data_available: measure_type === "lab",
      details: {
        document_url: url,
        lab_name: source,
      },
    });
  }
  return reports;
}

async function fetchWmsReports(identityName: string, lat: number, lng: number): Promise<PemReport[]> {
  const json = await si2pem.getWmsFeatureInfo<StationMeasureProperties>({
    layer: SI2PEM_WMS_LAYERS.measurementResults,
    bbox: [lng - 0.02, lat - 0.02, lng + 0.02, lat + 0.02],
    cqlFilter: `identity_names='${escapeCqlLiteral(identityName)}' AND url IS NOT NULL`,
    featureCount: 200,
    sortBy: "year D,date D",
  });
  if (!json.features?.length) return [];
  return parseWmsReports(json.features);
}

function mergeAndSort(reports: PemReport[][]): PemReport[] {
  return reports.flat().sort((a, b) => b.date.localeCompare(a.date));
}

async function handler(req: FastifyRequest<Params>, res: ReplyPayload<JSONBody<PemReport[]>>) {
  const { station_id } = req.params;
  const { lat, lng, operator: mnc } = req.query;

  const entityName = MNC_TO_ENTITY[mnc];
  const cacheKey = `pem:v3:${station_id}:${lat}:${lng}:${mnc}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached) as { data: PemReport[] });

  const reportRequests = [fetchWmsReports(station_id, lat, lng)];
  if (entityName) reportRequests.push(fetchInstallations(station_id, entityName));

  const reportResults = await Promise.allSettled(reportRequests);
  const failure = reportResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
  const data = mergeAndSort(reportResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
  if (!data.length && failure) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: failure.reason });

  const response = { data };
  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  return res.send(response);
}

const getPemByStationId: Route<Params, PemReport[]> = {
  url: "/pem/:station_id",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPemByStationId;
