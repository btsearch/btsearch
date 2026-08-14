import { operators, regions } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import {
  SI2PEMClient,
  type SI2PEMExtendedBaseStationProperties,
  SI2PEM_ERROR_CODES,
  SI2PEM_WFS_FEATURE_TYPES,
  isSI2PEMError,
  si2pemDateToISO,
} from "si2pem-reader";
import z from "zod";

import redis from "../../../../database/redis.ts";
import { ErrorResponse } from "../../../../errors.ts";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.ts";

export const MNC_TO_ENTITY: Record<number, string> = {
  26001: "Towerlink Poland Sp. z o.o.",
  26002: "T-Mobile Polska S.A.",
  26003: "Orange Polska S.A.",
  26006: "P4 Sp. z o.o.",
};
export const ENTITY_TO_MNC: Record<string, number> = {
  "Towerlink Poland Sp. z o.o.": 26001,
  "Polkomtel Sp. z o.o.": 26001,
  "T-Mobile Polska S.A.": 26002,
  "Orange Polska S.A.": 26003,
  "P4 Sp. z o.o.": 26006,
};

export const VOIVODESHIP_TO_TERYT_PREFIX: Record<string, string> = {
  Dolnośląskie: "02",
  "Kujawsko-pomorskie": "04",
  Lubelskie: "06",
  Lubuskie: "08",
  Łódzkie: "10",
  Małopolskie: "12",
  Mazowieckie: "14",
  Opolskie: "16",
  Podkarpackie: "18",
  Podlaskie: "20",
  Pomorskie: "22",
  Śląskie: "24",
  Świętokrzyskie: "26",
  "Warmińsko-mazurskie": "28",
  Wielkopolskie: "30",
  Zachodniopomorskie: "32",
};
export const TERYT_PREFIX_TO_VOIVODESHIP: Record<string, string> = Object.fromEntries(
  Object.entries(VOIVODESHIP_TO_TERYT_PREFIX).map(([name, prefix]) => [prefix, name]),
);

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
});
type PEMItem = z.infer<typeof PEMItemSchema>;

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
      .refine((v) => v in ENTITY_TO_MNC)
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

const MAP_CACHE_TTL = 3600;
const si2pem = new SI2PEMClient();

type ParsedWmsFeature = Omit<PEMItem, "id" | "region" | "operator"> & { operatorName: string };

type InactiveStationProperties = SI2PEMExtendedBaseStationProperties & {
  identity_names?: string | null;
  bs_identity_name?: string | null;
  name?: string | null;
  location_in_city?: string | null;
  installation_operator_name?: string | null;
  operator?: string | null;
};

async function fetchOperatorsMap(mncs: number[]) {
  const rows = mncs.length ? await db.select().from(operators).where(inArray(operators.mnc, mncs)) : [];
  return new Map(rows.map((op) => [op.mnc, op]));
}

async function withCache<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;
  const result = await fn();
  await redis.setEx(key, ttl, JSON.stringify(result));
  return result;
}

async function handleBoundsMode(bbox: [number, number, number, number], mncs: number[] | undefined): Promise<ResBody> {
  let json;
  try {
    json = await si2pem.getFeatures({
      typeName: SI2PEM_WFS_FEATURE_TYPES.plannedMeasures,
      bbox,
    });
  } catch (error) {
    if (isSI2PEMError(error) && error.code === SI2PEM_ERROR_CODES.httpError && error.statusCode !== null) throw new ErrorResponse("NOT_FOUND");
    throw new ErrorResponse("INTERNAL_SERVER_ERROR");
  }
  if (!json.features?.length) throw new ErrorResponse("NOT_FOUND");

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
  if (!parsed.length) throw new ErrorResponse("NOT_FOUND");

  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = parsed.filter((f) => f.date && new Date(f.date.to) >= oneMonthAgo);
  const filtered = mncs?.length ? recent.filter((f) => mncs.includes(ENTITY_TO_MNC[f.operatorName] ?? 0)) : recent;

  const uniqueMncs = [...new Set(filtered.map((f) => ENTITY_TO_MNC[f.operatorName]).filter(Boolean))] as number[];
  const operatorsMap = await fetchOperatorsMap(uniqueMncs);

  const data: PEMItem[] = filtered.map(({ operatorName, ...f }) => ({
    ...f,
    id: null,
    region: null,
    operator: operatorsMap.get(ENTITY_TO_MNC[operatorName] ?? 0) ?? null,
  }));

  return { totalCount: data.length, data };
}

async function handleInactiveStationsMode(
  page: number,
  limit: number,
  mncs: number[] | undefined,
  stationId: string | undefined,
  operatorName: string | undefined,
  regionRow: typeof regions.$inferSelect | undefined,
): Promise<ResBody> {
  const terytLo = regionRow ? Number.parseInt(VOIVODESHIP_TO_TERYT_PREFIX[regionRow.name]!, 10) * 100000 : undefined;
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

  const uniqueMncs = [...new Set(sorted.map((f) => ENTITY_TO_MNC[f.operatorName]).filter(Boolean))] as number[];
  const operatorsMap = await fetchOperatorsMap(uniqueMncs);
  const offset = (page - 1) * limit;

  const data: PEMItem[] = sorted.slice(offset, offset + limit).map(({ operatorName, ...f }) => ({
    ...f,
    id: null,
    region: regionRow ?? null,
    operator: operatorsMap.get(ENTITY_TO_MNC[operatorName] ?? 0) ?? null,
  }));

  return { totalCount: sorted.length, data };
}

const PLANNED_CACHE_TTL = 3600;
const PUBLISHED_CACHE_TTL = 86400;

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

  const uniqueMncs = [...new Set(results.map((r) => ENTITY_TO_MNC[r.base_station.operator ?? ""]).filter(Boolean))] as number[];
  const uniqueRegions = [...new Set(results.map((r) => capitalize(r.base_station.voivodeship)).filter(Boolean))] as string[];

  const [operatorsMap, dbRegions] = await Promise.all([
    fetchOperatorsMap(uniqueMncs),
    uniqueRegions.length ? db.select().from(regions).where(inArray(regions.name, uniqueRegions)) : Promise.resolve([]),
  ]);

  const regionsMap = new Map(dbRegions.map((r) => [r.name, r]));

  const data: PEMItem[] = results.map((result) => {
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
    };
  });

  return { totalCount: json.count, data };
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { bounds, page, limit, status, operators: mncs, station_id, operator, region } = req.query;

  const regionRow = region !== undefined ? (await db.select().from(regions).where(eq(regions.id, region)).limit(1))[0] : undefined;

  if (bounds) {
    const bbox = bounds.join(",");
    return res.send(await withCache(`pem:map:${bbox}:${mncs?.join(",") ?? ""}`, MAP_CACHE_TTL, () => handleBoundsMode(bounds, mncs)));
  }

  if (status === "INACTIVE") {
    const cacheKey = `pem:inactive:${page}:${limit}:${mncs?.join(",") ?? ""}:${station_id ?? ""}:${operator ?? ""}:${region ?? ""}`;
    return res.send(
      await withCache(cacheKey, PUBLISHED_CACHE_TTL, () => handleInactiveStationsMode(page, limit, mncs, station_id, operator, regionRow)),
    );
  }

  const cacheKey = `pem:planned:${status}:${page}:${limit}:${mncs?.join(",") ?? ""}:${station_id ?? ""}:${operator ?? ""}:${region ?? ""}`;
  const ttl = status === "PLANNED" ? PLANNED_CACHE_TTL : PUBLISHED_CACHE_TTL;
  return res.send(await withCache(cacheKey, ttl, () => handlePaginationMode(page, limit, status, mncs, station_id, operator, regionRow?.name)));
}

const plannedMeasurements: Route<ReqQuery, ResBody> = {
  method: "GET",
  url: "/pem/planned",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default plannedMeasurements;
