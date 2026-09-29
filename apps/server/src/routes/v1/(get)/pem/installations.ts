import type { FastifyRequest } from "fastify";
import { SI2PEMClient, isSI2PEMError } from "si2pem-reader";
import z from "zod";

import { ErrorResponse } from "../../../../errors.js";
import { ENTITY_TO_MNC, MNC_TO_ENTITY, fetchOperatorsMap } from "../../../../features/pem/entities.js";
import { attachInternalStationIds } from "../../../../features/pem/internalStations.js";
import { si2pemDateToCalendarDate, toSI2PEMFileUrl, warsawDateTimeToISO } from "../../../../features/pem/si2pemValues.js";
import { VOIVODESHIP_TO_TERYT_PREFIX, fetchRegion, fetchRegionsMap, getVoivodeshipByTeryt } from "../../../../features/pem/voivodeships.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { withRedisStaleCache } from "../../../../lib/redisCache.js";

const INSTALLATIONS_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 86400 };
const CACHE_KEY_PREFIX = "pem:installations:v1";
const si2pem = new SI2PEMClient();

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);
const coordinate = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number());

const SI2PEMInstallationSchema = z.object({
  base_station: z.object({
    id: z.number().int(),
    identity_name: optionalText,
    name: optionalText,
    operator: optionalText,
    installation_operator_name: optionalText,
    address: optionalText,
    latitude: coordinate,
    longitude: coordinate,
    teryt: z.union([z.number(), z.string()]).nullish(),
  }),
  base_station_identity_name: optionalText,
  venue_city: optionalText,
  venue_address: optionalText,
  published_at: z.string().transform(warsawDateTimeToISO).pipe(z.string()),
  entity: optionalText,
  installation_file: optionalText,
  report_file: optionalText,
  registration_date: optionalText,
  reference_no: optionalText,
});
type SI2PEMInstallation = z.infer<typeof SI2PEMInstallationSchema>;

const SI2PEMInstallationsPageSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(z.unknown()),
});

const InstallationSchema = z.object({
  station_id: z.string().nullable(),
  station_name: z.string().nullable(),
  operator: z.object({ name: z.string(), mnc: z.number().int() }).nullable(),
  entity: z.string(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    city: z.string(),
    address: z.string(),
  }),
  region: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  published_at: z.iso.datetime({ offset: true }),
  registration_date: z.iso.date().nullable(),
  reference_no: z.string().nullable(),
  installation_file: z.url().nullable(),
  report_file: z.url().nullable(),
  internal_station_id: z.number().int().nullable(),
});
type Installation = z.infer<typeof InstallationSchema>;
type UnmatchedInstallation = Omit<Installation, "internal_station_id">;

const schemaRoute = {
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    station_id: z.string().trim().max(64).optional(),
    operator: z.coerce
      .number()
      .int()
      .refine((mnc) => mnc in MNC_TO_ENTITY, { message: "Unsupported operator" })
      .optional(),
    region: z.coerce.number().int().positive().optional(),
  }),
  response: {
    200: z.object({
      totalCount: z.number(),
      data: z.array(InstallationSchema),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResBody = z.infer<(typeof schemaRoute.response)["200"]>;
type InstallationsQuery = { page: number; limit: number; stationId: string | undefined; mnc: number | undefined };

const EMPTY_RESULT: ResBody = { totalCount: 0, data: [] };

function getInstallationMnc(record: SI2PEMInstallation): number | null {
  const { operator, installation_operator_name } = record.base_station;
  return ENTITY_TO_MNC[record.entity ?? ""] ?? ENTITY_TO_MNC[installation_operator_name ?? ""] ?? ENTITY_TO_MNC[operator ?? ""] ?? null;
}

function getInstallationCity(record: SI2PEMInstallation): string {
  if (record.venue_city) return record.venue_city;
  const [city, ...rest] = (record.base_station.address ?? "").split(",");
  return rest.length > 0 ? (city?.trim() ?? "") : "";
}

async function getRegionVoivodeship(regionId: number): Promise<string | null> {
  const region = await fetchRegion(regionId);
  return region && region.name in VOIVODESHIP_TO_TERYT_PREFIX ? region.name.toLowerCase() : null;
}

async function fetchInstallationsPage({ page, limit, stationId, mnc, voivodeship }: InstallationsQuery & { voivodeship: string | undefined }) {
  let json: unknown;
  try {
    json = await si2pem.listInstallations({
      baseStation: stationId ?? "",
      entity: mnc === undefined ? undefined : MNC_TO_ENTITY[mnc],
      voivodeship,
      page,
      pageSize: limit,
    });
  } catch (error) {
    if (page > 1 && isSI2PEMError(error) && error.statusCode === 404) return null;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }

  const parsed = SI2PEMInstallationsPageSchema.safeParse(json);
  if (!parsed.success) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: parsed.error });
  const records = parsed.data.results.flatMap((row) => {
    const record = SI2PEMInstallationSchema.safeParse(row);
    return record.success ? [record.data] : [];
  });
  return { count: parsed.data.count, records };
}

async function loadInstallations({ regionId, ...query }: InstallationsQuery & { regionId: number | undefined }): Promise<ResBody> {
  const voivodeship = regionId === undefined ? undefined : await getRegionVoivodeship(regionId);
  if (voivodeship === null) return EMPTY_RESULT;

  const result = await fetchInstallationsPage({ ...query, voivodeship });
  if (!result) return EMPTY_RESULT;

  const records = result.records.map((record) => ({
    record,
    mnc: getInstallationMnc(record),
    regionName: getVoivodeshipByTeryt(record.base_station.teryt),
  }));
  const [operatorsMap, regionsMap] = await Promise.all([
    fetchOperatorsMap(records.map(({ mnc }) => mnc)),
    fetchRegionsMap(records.map(({ regionName }) => regionName)),
  ]);

  const items: UnmatchedInstallation[] = records.map(({ record, mnc, regionName }) => {
    const station = record.base_station;
    const operator = mnc === null ? undefined : operatorsMap.get(mnc);
    const region = regionName === null ? undefined : regionsMap.get(regionName);
    return {
      station_id: station.identity_name ?? record.base_station_identity_name,
      station_name: station.name,
      operator: operator && mnc !== null ? { name: operator.name, mnc } : null,
      entity: record.entity ?? station.installation_operator_name ?? station.operator ?? "",
      location: {
        latitude: station.latitude,
        longitude: station.longitude,
        city: getInstallationCity(record),
        address: record.venue_address ?? station.address ?? "",
      },
      region: region ? { id: region.id, name: region.name } : null,
      published_at: record.published_at,
      registration_date: si2pemDateToCalendarDate(record.registration_date),
      reference_no: record.reference_no,
      installation_file: toSI2PEMFileUrl(record.installation_file),
      report_file: toSI2PEMFileUrl(record.report_file),
    };
  });
  const data = await attachInternalStationIds(items);

  return { totalCount: result.count, data };
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { page, limit, station_id, operator, region } = req.query;
  const cacheKey = `${CACHE_KEY_PREFIX}:${page}:${limit}:${operator ?? ""}:${region ?? ""}:${station_id ?? ""}`;
  const { value } = await withRedisStaleCache(cacheKey, INSTALLATIONS_CACHE, () =>
    loadInstallations({ page, limit, stationId: station_id, mnc: operator, regionId: region }),
  );
  return res.send(value);
}

const listInstallations: Route<ReqQuery, ResBody> = {
  method: "GET",
  url: "/pem/installations",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default listInstallations;
