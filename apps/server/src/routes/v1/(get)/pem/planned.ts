import { operators, regions } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import { SI2PEMClient, type SI2PEMExtendedBaseStationProperties, SI2PEM_WFS_FEATURE_TYPES, si2pemDateToISO } from "si2pem-reader";
import z from "zod";

import { ErrorResponse } from "../../../../errors.ts";
import { ENTITY_TO_MNC, MNC_TO_ENTITY, fetchOperatorsMap } from "../../../../features/pem/entities.ts";
import { attachInternalStationIds } from "../../../../features/pem/internalStations.ts";
import { toSI2PEMFileUrl } from "../../../../features/pem/si2pemValues.ts";
import { VOIVODESHIP_TO_TERYT_PREFIX, fetchRegion, fetchRegionsMap } from "../../../../features/pem/voivodeships.ts";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.ts";
import { withRedisStaleCache } from "../../../../lib/redisCache.ts";

const operatorSchema = createSelectSchema(operators);
const regionSchema = createSelectSchema(regions);

const PEMItemSchema = z.object({
  id: z.number().nullable(),
  station_id: z.string().nullable(),
  operator: operatorSchema.nullable(),
  lab: z.object({ PCA: z.string(), name: z.string() }).nullable(),
  location: z.object({
    longitude: z.number(),
    latitude: z.number(),
    city: z.string(),
    address: z.string(),
  }),
  region: regionSchema.nullable(),
  date: z
    .object({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
    })
    .nullable(),
  status: z.enum(["PLANNED", "COMPLETED", "CANCELED", "INACTIVE"]),
  disabled_date: z.iso.datetime({ offset: true }).nullable().optional(),
  report_url: z.url().nullable(),
  internal_station_id: z.number().int().nullable(),
});
type PEMItem = z.infer<typeof PEMItemSchema>;
type UnmatchedPEMItem = Omit<PEMItem, "internal_station_id">;

const schemaRoute = {
  querystring: z.object({
    bounds: z
      .string()
      .regex(/^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$/)
      .transform((val) => val.split(",").map(Number) as [number, number, number, number])
      .optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(25),
    status: z.enum(["PLANNED", "COMPLETED", "CANCELED", "INACTIVE"]).default("PLANNED"),
    operators: z
      .string()
      .transform((val) =>
        val
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0),
      )
      .optional(),
    station_id: z.string().optional(),
    operator: z
      .string()
      .refine((v) => Object.hasOwn(ENTITY_TO_MNC, v))
      .optional(),
    region: z.coerce.number().int().positive().optional(),
  }),
  response: {
    200: z.object({
      totalCount: z.number(),
      data: z.array(PEMItemSchema),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResBody = z.infer<(typeof schemaRoute.response)["200"]>;

const MAP_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 6 * 3600 };
const PLANNED_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 86400 };
const PUBLISHED_CACHE = { freshTtlSeconds: 86400, staleTtlSeconds: 7 * 86400 };
const CACHE_KEY_PREFIX = "pem:planned:v4";
const si2pem = new SI2PEMClient();

type ParsedWmsFeature = Omit<UnmatchedPEMItem, "id" | "region" | "operator" | "report_url"> & { operatorName: string };

type InactiveStationProperties = SI2PEMExtendedBaseStationProperties & {
  identity_names?: string | null;
  bs_identity_name?: string | null;
  name?: string | null;
  location_in_city?: string | null;
  installation_operator_name?: string | null;
  operator?: string | null;
};

async function toPEMItems(features: ParsedWmsFeature[], region: PEMItem["region"]): Promise<PEMItem[]> {
  const operatorsMap = await fetchOperatorsMap(features.map((f) => ENTITY_TO_MNC[f.operatorName]));
  const items: UnmatchedPEMItem[] = features.map(({ operatorName, ...f }) => ({
    ...f,
    id: null,
    region,
    operator: operatorsMap.get(ENTITY_TO_MNC[operatorName] ?? 0) ?? null,
    report_url: null,
  }));
  return attachInternalStationIds(items);
}

async function handleBoundsMode(bbox: [number, number, number, number], mncs: number[] | undefined): Promise<ResBody> {
  let json;
  try {
    json = await si2pem.getFeatures({
      typeName: SI2PEM_WFS_FEATURE_TYPES.plannedMeasures,
      bbox,
    });
  } catch (error) {
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
  if (!json.features?.length) return { totalCount: 0, data: [] };

  const seen = new Set<string>();
  const parsed: ParsedWmsFeature[] = json.features.flatMap((feature) => {
    const {
      bs_identity_name: station_id,
      city,
      location_in_city: address,
      date_from,
      date_to,
      installation_operator_name,
      laboratory_name,
      laboratory_pca,
    } = feature.properties;
    const from = si2pemDateToISO(date_from);
    const to = si2pemDateToISO(date_to);
    if (!feature.geometry || !station_id || !from || !to || seen.has(station_id)) return [];
    const [lng, lat] = feature.geometry.coordinates;
    seen.add(station_id);
    return [
      {
        station_id,
        date: { from, to },
        lab: { PCA: laboratory_pca, name: laboratory_name },
        location: { latitude: lat, longitude: lng, city, address },
        operatorName: installation_operator_name,
        status: "PLANNED" as const,
      },
    ];
  });
  if (!parsed.length) return { totalCount: 0, data: [] };

  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = parsed.filter((f) => f.date && new Date(f.date.to) >= oneMonthAgo);
  const filtered = mncs?.length ? recent.filter((f) => mncs.includes(ENTITY_TO_MNC[f.operatorName] ?? 0)) : recent;
  const data = await toPEMItems(filtered, null);

  return { totalCount: data.length, data };
}

async function handleInactiveStationsMode(
  page: number,
  limit: number,
  mncs: number[] | undefined,
  stationId: string | undefined,
  operatorName: string | undefined,
  regionRow: z.infer<typeof regionSchema> | undefined,
): Promise<ResBody> {
  const terytPrefix = regionRow ? VOIVODESHIP_TO_TERYT_PREFIX[regionRow.name] : undefined;
  if (regionRow && terytPrefix === undefined) return { totalCount: 0, data: [] };
  const terytLo = terytPrefix === undefined ? undefined : Number.parseInt(terytPrefix, 10) * 100000;
  const cqlFilter = [
    "is_old=true AND is_active=false",
    stationId ? `AND identity_name='${stationId.replace(/'/g, "''")}'` : "",
    terytLo !== undefined ? `AND teryt >= ${terytLo} AND teryt < ${terytLo + 100000}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  let json;
  try {
    json = await si2pem.getFeatures(
      {
        typeName: SI2PEM_WFS_FEATURE_TYPES.extendedBaseStations,
        cqlFilter,
      },
      { maxJsonBytes: 64 * 1024 * 1024 },
    );
  } catch {
    throw new ErrorResponse("INTERNAL_SERVER_ERROR");
  }
  const seen = new Set<string>();
  const parsed: ParsedWmsFeature[] = (json.features ?? []).flatMap((feature) => {
    const properties: InactiveStationProperties = feature.properties;
    const {
      identity_name,
      identity_names,
      bs_identity_name,
      city,
      location_in_city,
      address,
      installation_operator_name,
      operator_name,
      operator,
      disabling_date,
      is_old,
      is_active,
    } = properties;
    const station_id = identity_name ?? identity_names ?? bs_identity_name ?? null;
    if (!feature.geometry || !station_id || seen.has(station_id) || !is_old || is_active) return [];
    const [lng, lat] = feature.geometry.coordinates;
    seen.add(station_id);
    return [
      {
        station_id,
        date: null,
        disabled_date: si2pemDateToISO(disabling_date),
        lab: null,
        location: { latitude: lat, longitude: lng, city: city ?? "", address: location_in_city ?? address ?? "" },
        operatorName: installation_operator_name ?? operator_name ?? operator ?? "",
        status: "INACTIVE" as const,
      },
    ];
  });

  const filteredByOperator = operatorName ? parsed.filter((f) => f.operatorName === operatorName) : parsed;
  const filtered = mncs?.length ? filteredByOperator.filter((f) => mncs.includes(ENTITY_TO_MNC[f.operatorName] ?? 0)) : filteredByOperator;
  const toTime = (v: string | null | undefined) => {
    const t = new Date(v ?? "").getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const sorted = [...filtered].sort((a, b) => toTime(b.disabled_date) - toTime(a.disabled_date));

  const offset = (page - 1) * limit;
  const data = await toPEMItems(sorted.slice(offset, offset + limit), regionRow ?? null);

  return { totalCount: sorted.length, data };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function handlePaginationMode(
  page: number,
  limit: number,
  status: string,
  mncs: number[] | undefined,
  baseStation: string | undefined,
  operatorName: string | undefined,
  regionName: string | undefined,
): Promise<ResBody> {
  const entityName = operatorName ?? (mncs?.length === 1 ? (MNC_TO_ENTITY[mncs[0]!] ?? "") : "");

  let json;
  try {
    json = await si2pem.listPlannedMeasurements({
      page,
      pageSize: limit,
      operator: entityName,
      status,
      baseStation,
      voivodeship: regionName?.toLowerCase(),
    });
  } catch {
    throw new ErrorResponse("INTERNAL_SERVER_ERROR");
  }

  const results =
    mncs && mncs.length > 1 ? json.results.filter((r) => mncs.includes(ENTITY_TO_MNC[r.base_station.operator ?? ""] ?? 0)) : json.results;

  const [operatorsMap, regionsMap] = await Promise.all([
    fetchOperatorsMap(results.map((r) => ENTITY_TO_MNC[r.base_station.operator ?? ""])),
    fetchRegionsMap(results.map((r) => capitalize(r.base_station.voivodeship))),
  ]);

  const items: UnmatchedPEMItem[] = results.map((result) => {
    const mnc = ENTITY_TO_MNC[result.base_station.operator];
    const region = capitalize(result.base_station.voivodeship);
    const from = si2pemDateToISO(result.date_from);
    const to = si2pemDateToISO(result.date_to);

    return {
      id: result.id,
      station_id: result.base_station.identity_name ?? null,
      location: {
        longitude: Number(result.base_station.longitude),
        latitude: Number(result.base_station.latitude),
        city: result.base_station.city,
        address: result.base_station.address,
      },
      region: regionsMap.get(region) ?? null,
      operator: operatorsMap.get(mnc ?? 0) ?? null,
      lab: result.lab,
      date: from && to ? { from, to } : null,
      status: result.status,
      report_url: toSI2PEMFileUrl(result.report),
    };
  });
  const data = await attachInternalStationIds(items);

  return { totalCount: json.count, data };
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { bounds, page, limit, status, operators: mncs, station_id, operator, region } = req.query;

  const loadRegion = async () => (region === undefined ? undefined : fetchRegion(region));

  if (bounds) {
    const cacheKey = `${CACHE_KEY_PREFIX}:map:${bounds.join(",")}:${mncs?.join(",") ?? ""}`;
    const { value } = await withRedisStaleCache(cacheKey, MAP_CACHE, () => handleBoundsMode(bounds, mncs));
    return res.send(value);
  }

  const filtersKey = `${page}:${limit}:${mncs?.join(",") ?? ""}:${station_id ?? ""}:${operator ?? ""}:${region ?? ""}`;
  if (status === "INACTIVE") {
    const cacheKey = `${CACHE_KEY_PREFIX}:inactive:${filtersKey}`;
    const { value } = await withRedisStaleCache(cacheKey, PUBLISHED_CACHE, async () =>
      handleInactiveStationsMode(page, limit, mncs, station_id, operator, await loadRegion()),
    );
    return res.send(value);
  }

  const cacheKey = `${CACHE_KEY_PREFIX}:list:${status}:${filtersKey}`;
  const cacheOptions = status === "PLANNED" ? PLANNED_CACHE : PUBLISHED_CACHE;
  const { value } = await withRedisStaleCache(cacheKey, cacheOptions, async () =>
    handlePaginationMode(page, limit, status, mncs, station_id, operator, (await loadRegion())?.name),
  );
  return res.send(value);
}

const plannedMeasurements: Route<ReqQuery, ResBody> = {
  method: "GET",
  url: "/pem/planned",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default plannedMeasurements;
