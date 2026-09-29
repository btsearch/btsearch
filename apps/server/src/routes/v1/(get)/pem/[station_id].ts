import type { FastifyRequest } from "fastify/types/request.js";
import { SI2PEMClient, type SI2PEMMeasureProperties, SI2PEM_WMS_LAYERS, escapeCqlLiteral, si2pemDateToISO } from "si2pem-reader";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { MNC_TO_ENTITY } from "../../../../features/pem/entities.js";
import { toSI2PEMFileUrl, warsawDateTimeToISO } from "../../../../features/pem/si2pemValues.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { withRedisStaleCache } from "../../../../lib/redisCache.js";

const REPORTS_CACHE = { freshTtlSeconds: 86400, staleTtlSeconds: 7 * 86400 };
const si2pem = new SI2PEMClient();

type Params = { Params: { station_id: string }; Querystring: { lat: number; lng: number; operator: number } };

const mapMeasurement = z.object({
  document_url: z.url(),
  lab_name: z.string(),
});

const searchMeasurement = z.object({
  document_url: z.url(),
  installation_document: z.url().nullable(),
  lab_name: z.string(),
});

const PemReportResponse = z.object({
  station_id: z.string(),
  source: z.enum(["map", "search"]),
  date: z.iso.datetime({ offset: true }),
  type: z.enum(["map_measurement", "search_measurement"]),
  antenna_data_available: z.boolean(),
  details: z.union([searchMeasurement, mapMeasurement]),
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
    const date = warsawDateTimeToISO(result.published_at);
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
        installation_document: toSI2PEMFileUrl(result.installation_file),
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

async function loadCachedReports(key: string, load: () => Promise<PemReport[]>): Promise<PemReport[]> {
  const { value } = await withRedisStaleCache(key, REPORTS_CACHE, load);
  return value;
}

async function handler(req: FastifyRequest<Params>, res: ReplyPayload<JSONBody<PemReport[]>>) {
  const { station_id } = req.params;
  const { lat, lng, operator: mnc } = req.query;

  const entityName = MNC_TO_ENTITY[mnc];
  const reportRequests = [loadCachedReports(`pem:map:v2:${station_id}:${lat}:${lng}`, () => fetchWmsReports(station_id, lat, lng))];
  if (entityName) reportRequests.push(loadCachedReports(`pem:search:v2:${station_id}:${mnc}`, () => fetchInstallations(station_id, entityName)));

  const reportResults = await Promise.allSettled(reportRequests);
  const failure = reportResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
  const data = mergeAndSort(reportResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
  if (!data.length && failure) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: failure.reason });

  return res.send({ data });
}

const getPemByStationId: Route<Params, PemReport[]> = {
  url: "/pem/:station_id",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPemByStationId;
