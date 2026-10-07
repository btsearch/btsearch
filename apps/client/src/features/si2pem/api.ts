import type { EmfFiling, EmfInactiveSite, EmfMeasurement, EmfMeasurementStatus, Paging } from "@openbts/shared/contract";
import { queryOptions, skipToken } from "@tanstack/react-query";

import { API_V2_BASE, BackendUnavailableError, fetchJson, isNotFound } from "@/lib/api";

export type MeasurementTab = "planned" | "completed" | "canceled" | "inactive";
export type MeasurementTabRow = EmfMeasurement | EmfInactiveSite;
export type MapPlannedMeasurement = Omit<EmfMeasurement, "operator" | "region">;

type EmfListPath = "measurements" | "inactive-sites" | "filings";
type EmfListAnswer<Row> = { data: Row[]; paging: Paging };
type EmfRows<Row> = { rows: Row[]; total: number };
type RegisterListParams = {
  page: number;
  limit: number;
  siteId?: string;
  operatorId?: number;
  regionId?: number;
};
type MeasurementTabParams = RegisterListParams & { tab: MeasurementTab };

export const MAP_PLANNED_MEASUREMENTS_FAMILY = "planned-measurements";

const MAP_MEASUREMENTS_PAGE_SIZE = 1000;
const MAP_MEASUREMENTS_MAX_PAGES = 10;
const MAP_MEASUREMENTS_STALE_TIME = 1000 * 60 * 10;
const REGISTER_UNAVAILABLE_STATUS = 503;
const REGISTER_ROW_INCLUDE = "operator,region";
const SITE_ID_MAX_LENGTH = 64;
const TAB_STATUSES: Record<Exclude<MeasurementTab, "inactive">, EmfMeasurementStatus> = {
  planned: "planned",
  completed: "completed",
  canceled: "cancelled",
};

class EmfRegisterUnavailableError extends Error {
  constructor() {
    super("The EMF register is not answering.");
  }
}

export function isInactiveSite(row: MeasurementTabRow): row is EmfInactiveSite {
  return "disabledOn" in row;
}

async function fetchEmfRows<Row>(path: EmfListPath, params: URLSearchParams, signal?: AbortSignal): Promise<EmfRows<Row>> {
  try {
    const { data, paging } = await fetchJson<EmfListAnswer<Row>>(`${API_V2_BASE}/emf/${path}?${params.toString()}`, { signal });
    return { rows: data, total: paging.total ?? data.length };
  } catch (error) {
    if (isNotFound(error)) return { rows: [], total: 0 };
    const isRegisterDown = error instanceof BackendUnavailableError && error.status === REGISTER_UNAVAILABLE_STATUS;
    if (isRegisterDown) throw new EmfRegisterUnavailableError();
    throw error;
  }
}

function buildRegisterListParams({ page, limit, siteId, operatorId, regionId }: RegisterListParams): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
    includeTotal: "true",
    include: REGISTER_ROW_INCLUDE,
  });
  const siteIdPart = siteId?.trim().slice(0, SITE_ID_MAX_LENGTH) ?? "";
  if (siteIdPart !== "") params.set("siteId", siteIdPart);
  if (operatorId !== undefined) params.set("operatorIds", String(operatorId));
  if (regionId !== undefined) params.set("regionIds", String(regionId));

  return params;
}

export function fetchMeasurementTabRows({ tab, ...list }: MeasurementTabParams, signal?: AbortSignal): Promise<EmfRows<MeasurementTabRow>> {
  const params = buildRegisterListParams(list);
  if (tab === "inactive") return fetchEmfRows<EmfInactiveSite>("inactive-sites", params, signal);

  params.set("statuses", TAB_STATUSES[tab]);
  return fetchEmfRows<EmfMeasurement>("measurements", params, signal);
}

export function fetchFilingRows(list: RegisterListParams, signal?: AbortSignal): Promise<EmfRows<EmfFiling>> {
  return fetchEmfRows<EmfFiling>("filings", buildRegisterListParams(list), signal);
}

function fetchMapPlannedMeasurementPage(filters: URLSearchParams, offset: number, signal?: AbortSignal): Promise<EmfRows<MapPlannedMeasurement>> {
  const params = new URLSearchParams(filters);
  params.set("limit", String(MAP_MEASUREMENTS_PAGE_SIZE));
  if (offset === 0) params.set("includeTotal", "true");
  else params.set("offset", String(offset));

  return fetchEmfRows<MapPlannedMeasurement>("measurements", params, signal);
}

async function fetchMapPlannedMeasurements(bbox: string, operatorIds: readonly number[], signal?: AbortSignal): Promise<MapPlannedMeasurement[]> {
  const filters = new URLSearchParams({ bbox });
  if (operatorIds.length > 0) filters.set("operatorIds", operatorIds.join(","));

  const firstPage = await fetchMapPlannedMeasurementPage(filters, 0, signal);
  const pageCount = Math.min(Math.ceil(firstPage.total / MAP_MEASUREMENTS_PAGE_SIZE), MAP_MEASUREMENTS_MAX_PAGES);
  const laterOffsets = Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => (index + 1) * MAP_MEASUREMENTS_PAGE_SIZE);
  const laterPages = await Promise.all(laterOffsets.map((offset) => fetchMapPlannedMeasurementPage(filters, offset, signal)));

  return [firstPage, ...laterPages].flatMap((page) => page.rows);
}

export function mapPlannedMeasurementsQueryOptions(bbox: string, operatorIds: readonly number[]) {
  const sortedOperatorIds = [...new Set(operatorIds)].sort((left, right) => left - right);

  return queryOptions({
    queryKey: [MAP_PLANNED_MEASUREMENTS_FAMILY, bbox, sortedOperatorIds.join(",")] as const,
    queryFn: bbox === "" ? skipToken : ({ signal }) => fetchMapPlannedMeasurements(bbox, sortedOperatorIds, signal),
    staleTime: MAP_MEASUREMENTS_STALE_TIME,
    retry: false,
  });
}
