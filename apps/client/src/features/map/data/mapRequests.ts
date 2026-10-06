import type { Band, CellRat, Operator, StationStatus } from "@openbts/shared/contract";

import { REGISTER_COUNTRY_CODE } from "../constants";
import { DEFAULT_MAP_FILTERS, IOT_RAT, type MapFilters, UNKNOWN_BAND_LABEL, listAppliedMapBands, listAppliedMapRats } from "./mapFilters";
import { type MapLookups, listBandIdsByLabels } from "./mapLookups";
import { toV1OperatorMnc, toV2StationStatus } from "@/features/station-details/station/utils/stations";
import { MOST_LIST_VALUES, normalizeSearchText } from "@/lib/apiValues";
import type { StationSource, StationStatus as V1StationStatus } from "@/types/station";

export type MapListRequest = {
  filters: MapFilters;
  lookups: MapLookups | undefined;
  limit: number;
  wantAzimuths: boolean;
  searchText?: string;
  listId?: string;
};

export type MapLocationsQuery = {
  source: StationSource;
  params: string | null;
};

type RecentFilters = Pick<MapFilters, "recentDays" | "recentDateFields">;

const V1_STATUS_ORDER: readonly V1StationStatus[] = ["published", "pending", "inactive"];
const CELL_RATS: ReadonlyMap<string, CellRat> = new Map<string, CellRat>([
  ["GSM", "gsm"],
  ["UMTS", "umts"],
  ["LTE", "lte"],
  ["NR", "nr"],
]);
const UNKNOWN_BAND_WORD = "unknown";
const NO_MATCHING_BAND_ID = 2_147_483_647;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;
const LIST_INCLUDE = "stations";
const LIST_INCLUDE_WITH_SECTORS = "stations,stations.sectors";

type BandFilterEntry = number | typeof UNKNOWN_BAND_WORD;

function listV2Statuses(statuses: readonly V1StationStatus[]): StationStatus[] {
  const chosen = statuses.length > 0 ? statuses : DEFAULT_MAP_FILTERS.status;
  return V1_STATUS_ORDER.filter((status) => chosen.includes(status)).map(toV2StationStatus);
}

export function listCellRats(rats: readonly string[]): CellRat[] {
  return [...CELL_RATS].flatMap(([rat, cellRat]) => (rats.includes(rat) ? [cellRat] : []));
}

function sortIds(ids: readonly number[]): number[] {
  return [...ids].sort((left, right) => left - right);
}

export function listBandFilterEntries(labels: readonly number[], bands: readonly Band[] | undefined): BandFilterEntry[] | null {
  const knownLabels = labels.filter((label) => label !== UNKNOWN_BAND_LABEL);
  const unknownEntries: BandFilterEntry[] = knownLabels.length < labels.length ? [UNKNOWN_BAND_WORD] : [];
  if (knownLabels.length === 0) return unknownEntries;
  if (bands === undefined) return null;

  const bandIds = listBandIdsByLabels(bands, knownLabels).slice(0, MOST_LIST_VALUES - unknownEntries.length);
  return bandIds.length > 0 ? [...bandIds, ...unknownEntries] : [NO_MATCHING_BAND_ID, ...unknownEntries];
}

function getRecentCutoff(days: number): string {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

export function setOperatorParams(params: URLSearchParams, operatorIds: readonly number[]): void {
  if (operatorIds.length === 0) return;

  params.set("operatorIds", sortIds(operatorIds).slice(0, MOST_LIST_VALUES).join(","));
  params.set("keepOtherCountries", "true");
}

export function setRecentParams(params: URLSearchParams, { recentDays, recentDateFields }: RecentFilters): void {
  if (recentDays === null) return;

  params.set(recentDateFields.includes("updatedAt") ? "updatedAfter" : "createdAfter", getRecentCutoff(recentDays));
}

function clampPageSize(limit: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.round(limit)));
}

function buildStationFilterParams({ filters, lookups }: MapListRequest): URLSearchParams | null {
  const bandFilter = listBandFilterEntries(filters.bands, lookups?.bands);
  if (bandFilter === null) return null;

  const params = new URLSearchParams();
  const rats = listCellRats(filters.rat);

  params.set("statuses", listV2Statuses(filters.status).join(","));
  setOperatorParams(params, filters.operatorIds);
  if (rats.length > 0) params.set("rats", rats.join(","));
  if (filters.rat.includes(IOT_RAT)) params.set("supportsIot", "true");
  if (bandFilter.length > 0) params.set("bandIds", bandFilter.join(","));
  if (filters.uplinkTypes.length > 0) params.set("backhaulMediums", filters.uplinkTypes.join(","));
  setRecentParams(params, filters);
  return params;
}

function buildMapListParams(request: MapListRequest): string | null {
  const { filters, limit, wantAzimuths, searchText, listId } = request;
  const params = buildStationFilterParams(request);
  if (params === null) return null;

  const text = normalizeSearchText(searchText ?? "");
  if (text !== "") params.set("q", text);
  if (listId !== undefined) params.set("listId", listId);
  if (filters.countryCodes.length > 0) params.set("countryCodes", [...filters.countryCodes].sort().slice(0, MOST_LIST_VALUES).join(","));
  params.set("include", wantAzimuths ? LIST_INCLUDE_WITH_SECTORS : LIST_INCLUDE);
  params.set("includeTotal", "true");
  params.set("limit", String(clampPageSize(limit)));
  return params.toString();
}

export function listRegisterOperators(operatorIds: readonly number[], operators: readonly Operator[] | undefined): Operator[] | null {
  if (operatorIds.length === 0) return [];
  if (operators === undefined) return null;

  const chosenIds = new Set(operatorIds);
  return operators.filter((operator) => chosenIds.has(operator.id) && operator.countryCode === REGISTER_COUNTRY_CODE);
}

function listOperatorMncs(operators: readonly Operator[]): number[] {
  return operators.flatMap((operator) => {
    const mnc = toV1OperatorMnc(operator);
    return mnc === null ? [] : [mnc];
  });
}

function buildRegisterListParams({ filters, lookups, limit, wantAzimuths, listId }: MapListRequest): string | null {
  const registerOperators = listRegisterOperators(filters.operatorIds, lookups?.operators);
  if (registerOperators === null) return null;

  const params = new URLSearchParams();
  const operatorMncs = listOperatorMncs(registerOperators);
  const bands = listAppliedMapBands(filters);
  const rats = listAppliedMapRats(filters);
  const dateFields = filters.recentDateFields.length > 0 ? filters.recentDateFields : DEFAULT_MAP_FILTERS.recentDateFields;

  if (operatorMncs.length > 0) params.set("operators", operatorMncs.join(","));
  if (bands.length > 0) params.set("bands", bands.join(","));
  if (rats.length > 0) params.set("rat", rats.join(","));
  if (filters.recentDays !== null) params.set("since", `${dateFields.join(",")}:${filters.recentDays}`);
  if (listId !== undefined) params.set("list", listId);
  if (wantAzimuths) params.set("azimuths", "true");
  params.set("limit", String(clampPageSize(limit)));
  return params.toString();
}

export function buildMapLocationsQuery(request: MapListRequest): MapLocationsQuery {
  const { source } = request.filters;
  return { source, params: source === "uke" ? buildRegisterListParams(request) : buildMapListParams(request) };
}
