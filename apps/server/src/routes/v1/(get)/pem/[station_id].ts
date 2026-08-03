import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import redis from "../../../../database/redis.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const WMS_URL = "https://si2pem.gov.pl/geoserver/public/wms";
const INSTALLATIONS_URL = "https://si2pem.gov.pl/api/all_installation_info/";
const CACHE_TTL = 86400; // 24h

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

type InstallationResult = {
  base_station: { id: number; identity_name: string } | null;
  published_at: string;
  entity: string;
  installation_file: string | null;
  report_file: string | null;
  registration_date: string | null;
  reference_no: string | null;
  remarks: string | null;
};

type InstallationsResponse = {
  count: number;
  results: InstallationResult[];
};

function parsePemDate(value: string): Date | null {
  const si2pemDateMatch = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(value);
  if (si2pemDateMatch) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = si2pemDateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIsoString(value: string): string {
  const date = parsePemDate(value);
  if (date === null) return value;
  return date.toISOString();
}

function parsePublishedAt(value: string): number {
  return parsePemDate(value)?.getTime() ?? 0;
}

async function fetchInstallations(stationId: string, entityName: string): Promise<PemReport[] | null> {
  const params = new URLSearchParams({
    base_station: stationId,
    entity: entityName,
    venue_city: "",
    street: "",
    voivodeship: "",
    county: "",
    page: "1",
    page_size: "25",
  });

  let json: InstallationsResponse;
  try {
    const res = await fetch(`${INSTALLATIONS_URL}?${params.toString()}`, {
      headers: {
        Origin: "https://si2pem.gov.pl",
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;
    json = (await res.json()) as InstallationsResponse;
  } catch {
    return null;
  }

  if (!json.count || !json.results?.length) return null;

  const withReports = json.results.filter((r) => r.report_file !== null && r.report_file !== "" && r.base_station?.identity_name === stationId);
  if (!withReports.length) return null;

  const sorted = [...withReports].sort((a, b) => parsePublishedAt(b.published_at) - parsePublishedAt(a.published_at));

  const seen = new Set<string>();
  const reports: PemReport[] = [];
  for (const r of sorted) {
    const url = r.report_file!;
    if (seen.has(url)) continue;
    seen.add(url);
    reports.push({
      station_id: r.base_station?.identity_name ?? "",
      source: "search",
      date: toIsoString(r.published_at),
      type: "search_measurement",
      details: {
        document_url: url,
        installation_document: r.installation_file ?? "",
        lab_name: r.entity,
      },
    });
  }

  return reports.length ? reports : null;
}

type WmsFeature = {
  id: string;
  properties: {
    identity_names: string | null;
    url: string | null;
    date: string;
    year: number;
    source: string;
    number: string;
    intensity: number;
  };
};

type WmsResponse = { features: WmsFeature[] };

function buildWmsParams(identityName: string, lat: number, lng: number, featureCount: number): URLSearchParams {
  const bbox = `${lng - 0.02},${lat - 0.02},${lng + 0.02},${lat + 0.02}`;
  const layers = "measures";
  return new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    SRS: "EPSG:4326",
    LAYERS: layers,
    QUERY_LAYERS: layers,
    INFO_FORMAT: "application/json",
    FEATURE_COUNT: String(featureCount),
    WIDTH: "100",
    HEIGHT: "100",
    X: "50",
    Y: "50",
    FORMAT: "image/png",
    BBOX: bbox,
    CQL_FILTER: `identity_names='${identityName}' AND url IS NOT NULL`,
    SORTBY: "year D,date D",
  });
}

function parseWmsReports(features: WmsFeature[]): PemReport[] {
  const sorted = [...features].sort((a, b) => {
    if (b.properties.year !== a.properties.year) return b.properties.year - a.properties.year;
    return b.properties.date.localeCompare(a.properties.date);
  });
  const seen = new Set<string>();
  return sorted.reduce<PemReport[]>((acc, feature) => {
    const { url, date, source, identity_names } = feature.properties;
    if (!url || seen.has(url)) return acc;
    seen.add(url);
    acc.push({
      station_id: identity_names ?? "",
      source: "map",
      date: toIsoString(date),
      type: "map_measurement",
      details: {
        document_url: url,
        lab_name: source,
      },
    });
    return acc;
  }, []);
}

async function fetchWmsReports(identityName: string, lat: number, lng: number): Promise<PemReport[] | null> {
  const res = await fetch(`${WMS_URL}?${buildWmsParams(identityName, lat, lng, 200).toString()}`);
  if (!res.ok) return null;
  const json = (await res.json()) as WmsResponse;
  if (!json.features?.length) return null;
  const data = parseWmsReports(json.features);
  return data.length ? data : null;
}

function mergeAndSort(a: PemReport[] | null, b: PemReport[] | null): PemReport[] | null {
  const combined = [...(a ?? []), ...(b ?? [])];
  if (combined.length === 0) return null;

  return combined.sort((x, y) => parsePublishedAt(y.date) - parsePublishedAt(x.date));
}

async function handler(req: FastifyRequest<Params>, res: ReplyPayload<JSONBody<PemReport[]>>) {
  const { station_id } = req.params;
  const { lat, lng, operator: mnc } = req.query;

  const entityName = MNC_TO_ENTITY[mnc];
  const cacheKey = `pem:v2:${station_id}:${lat}:${lng}:${mnc}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached) as { data: PemReport[] });

  const [installationsResult, wmsResult] = await Promise.all([
    entityName ? fetchInstallations(station_id, entityName) : Promise.resolve(null),
    fetchWmsReports(station_id, lat, lng),
  ]);

  const data = mergeAndSort(installationsResult, wmsResult);
  if (!data) throw new ErrorResponse("NOT_FOUND");

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
