import { DEFAULT_EMF_MEASUREMENT_STATUSES } from "@openbts/shared/contract";
import type { Bbox, EmfMeasurementList, EmfMeasurementListQuery, EmfMeasurementStatus } from "@openbts/shared/contract";
import { SI2PEM_ERROR_CODES, SI2PEM_WFS_FEATURE_TYPES, isSI2PEMError } from "si2pem-reader";
import { z } from "zod/v4";

import { ErrorResponse } from "../../errors.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";
import { ENTITY_TO_MNC } from "../pem/entities.js";
import { si2pemDateToWarsawDay, toSI2PEMFileUrl } from "../pem/si2pemValues.js";
import {
  type ListWindow,
  type RegisterFilter,
  type SiteRow,
  createSiteMatcher,
  registerFilters,
  resolveWindow,
  toPaging,
  withSiteRefs,
} from "./lists.js";
import { type RegisterReader, readRegisterWindow, registerCoordinate, registerReader, registerText } from "./register.js";
import { si2pem } from "./si2pem.js";

type MeasurementRow = SiteRow & {
  id: number | null;
  status: EmfMeasurementStatus;
  startsOn: string | null;
  endsOn: string | null;
  laboratory: { name: string; accreditationNumber: string | null } | null;
  reportUrl: string | null;
};
type FoundMeasurements = { total: number; rows: MeasurementRow[] };

const PLANNED_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 86400 };
const PUBLISHED_CACHE = { freshTtlSeconds: 86400, staleTtlSeconds: 7 * 86400 };
const MAP_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 6 * 3600 };
const REGISTER_KEY_PREFIX = "emf:measurements:register:v1";
const MAP_KEY_PREFIX = "emf:measurements:map:v1";
const REGISTER_STATUSES = { planned: "PLANNED", completed: "COMPLETED", cancelled: "CANCELED" } as const;
const API_STATUSES = { PLANNED: "planned", COMPLETED: "completed", CANCELED: "cancelled" } as const;
const REGISTER_AREA: Bbox = [14, 48.75, 24.25, 55];
const MAP_GRID_DEGREES = 0.25;
const MAP_RECENT_DAYS = 30;
const DAY_MS = 86_400_000;

const registerMeasurementSchema = z.object({
  id: z.number().int(),
  base_station: z.object({
    identity_name: registerText,
    city: registerText,
    address: registerText,
    voivodeship: registerText,
    operator: registerText,
    longitude: registerCoordinate,
    latitude: registerCoordinate,
  }),
  date_from: registerText,
  date_to: registerText,
  lab: z.object({ PCA: registerText, name: registerText }).nullish(),
  status: z.enum(["PLANNED", "COMPLETED", "CANCELED"]),
  report: registerText,
});

function toRegisterRow(result: unknown): MeasurementRow | null {
  const parsed = registerMeasurementSchema.safeParse(result);
  if (!parsed.success) return null;

  const { base_station: station, lab, ...measurement } = parsed.data;
  return {
    id: measurement.id,
    siteId: station.identity_name,
    mnc: ENTITY_TO_MNC[station.operator ?? ""] ?? null,
    regionName: station.voivodeship === null ? null : station.voivodeship.charAt(0).toUpperCase() + station.voivodeship.slice(1),
    latitude: station.latitude,
    longitude: station.longitude,
    city: station.city,
    address: station.address,
    status: API_STATUSES[measurement.status],
    startsOn: si2pemDateToWarsawDay(measurement.date_from),
    endsOn: si2pemDateToWarsawDay(measurement.date_to),
    laboratory: lab?.name ? { name: lab.name, accreditationNumber: lab.PCA } : null,
    reportUrl: toSI2PEMFileUrl(measurement.report),
  };
}

function measurementsReader(
  status: EmfMeasurementStatus,
  { entityName, voivodeship }: RegisterFilter,
  siteId: string | undefined,
): RegisterReader<MeasurementRow> {
  return registerReader({
    cacheKeyPrefix: REGISTER_KEY_PREFIX,
    cacheKeyParts: [status, entityName, voivodeship, siteId],
    cache: status === "planned" ? PLANNED_CACHE : PUBLISHED_CACHE,
    voivodeship,
    fetchPage: (page, pageSize) =>
      si2pem.listPlannedMeasurements({
        page,
        pageSize,
        operator: entityName ?? "",
        status: REGISTER_STATUSES[status],
        baseStation: siteId,
        voivodeship: voivodeship?.toLowerCase(),
      }),
    toRow: toRegisterRow,
  });
}

async function findRegisterRows(query: EmfMeasurementListQuery, window: ListWindow): Promise<FoundMeasurements> {
  const statuses = [...new Set(query.statuses ?? DEFAULT_EMF_MEASUREMENT_STATUSES)];
  const filters = await registerFilters(query);
  const readers = statuses.flatMap((status) => filters.map((filter) => measurementsReader(status, filter, query.siteId)));

  return readRegisterWindow(readers, window);
}

function snapToMapGrid([west, south, east, north]: Bbox): Bbox | null {
  const [areaWest, areaSouth, areaEast, areaNorth] = REGISTER_AREA;
  const isSplit = west > east;
  if (isSplit && west >= areaEast && east <= areaWest) return null;

  const snappedWest = isSplit ? areaWest : Math.max(Math.floor(west / MAP_GRID_DEGREES) * MAP_GRID_DEGREES, areaWest);
  const snappedEast = isSplit ? areaEast : Math.min(Math.ceil(east / MAP_GRID_DEGREES) * MAP_GRID_DEGREES, areaEast);
  const snappedSouth = Math.max(Math.floor(south / MAP_GRID_DEGREES) * MAP_GRID_DEGREES, areaSouth);
  const snappedNorth = Math.min(Math.ceil(north / MAP_GRID_DEGREES) * MAP_GRID_DEGREES, areaNorth);
  return snappedWest < snappedEast && snappedSouth < snappedNorth ? [snappedWest, snappedSouth, snappedEast, snappedNorth] : null;
}

function isInside({ latitude, longitude }: MeasurementRow, [west, south, east, north]: Bbox): boolean {
  if (latitude < south || latitude > north) return false;
  return west < east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;
}

function refuseOversizedArea(error: unknown): never {
  if (isSI2PEMError(error) && error.code === SI2PEM_ERROR_CODES.responseTooLarge) {
    throw new ErrorResponse("BAD_REQUEST", { message: "This area holds too many measurements. Ask for a smaller box.", cause: error });
  }
  throw error;
}

async function fetchMapRows(box: Bbox): Promise<MeasurementRow[]> {
  const json = await si2pem.getFeatures({ typeName: SI2PEM_WFS_FEATURE_TYPES.plannedMeasures, bbox: box }).catch(refuseOversizedArea);

  const earliestEnd = new Date(Date.now() - MAP_RECENT_DAYS * DAY_MS).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const rows = (json.features ?? []).flatMap<MeasurementRow>(({ geometry, properties }) => {
    const siteId = properties.bs_identity_name?.trim() || null;
    const startsOn = si2pemDateToWarsawDay(properties.date_from);
    const endsOn = si2pemDateToWarsawDay(properties.date_to);
    if (!geometry || siteId === null || startsOn === null || endsOn === null || endsOn < earliestEnd || seen.has(siteId)) return [];

    const [longitude, latitude] = geometry.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];

    seen.add(siteId);
    const laboratoryName = properties.laboratory_name?.trim() || null;
    return [
      {
        id: null,
        siteId,
        mnc: ENTITY_TO_MNC[properties.installation_operator_name ?? ""] ?? null,
        regionName: null,
        latitude,
        longitude,
        city: properties.city?.trim() || null,
        address: properties.location_in_city?.trim() || null,
        status: "planned",
        startsOn,
        endsOn,
        laboratory: laboratoryName === null ? null : { name: laboratoryName, accreditationNumber: properties.laboratory_pca?.trim() || null },
        reportUrl: null,
      },
    ];
  });

  return rows.sort((a, b) => (a.siteId ?? "").localeCompare(b.siteId ?? ""));
}

async function findMapRows(query: EmfMeasurementListQuery, bbox: Bbox, window: ListWindow): Promise<FoundMeasurements> {
  const box = snapToMapGrid(bbox);
  if (box === null) return { total: 0, rows: [] };

  const [{ value }, matchesQuery] = await Promise.all([
    withRedisStaleCache(`${MAP_KEY_PREFIX}:${box.join(",")}`, MAP_CACHE, () => fetchMapRows(box)),
    createSiteMatcher({ operatorIds: query.operatorIds, siteId: query.siteId }),
  ]);
  const rows = value.filter((row) => isInside(row, bbox) && matchesQuery(row));

  return { total: rows.length, rows: rows.slice(window.offset, window.offset + window.limit) };
}

export async function listEmfMeasurements(query: EmfMeasurementListQuery): Promise<EmfMeasurementList> {
  const window = resolveWindow(query);
  const { total, rows } = query.bbox === undefined ? await findRegisterRows(query, window) : await findMapRows(query, query.bbox, window);

  return {
    data: (await withSiteRefs(rows, query.include)).map(({ row, refs }) => ({
      id: row.id,
      ...refs,
      status: row.status,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      laboratory: row.laboratory,
      reportUrl: row.reportUrl,
    })),
    paging: toPaging(window, total, query.includeTotal),
  };
}
