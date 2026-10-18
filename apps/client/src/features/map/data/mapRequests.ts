import {
  type Band,
  type CellRat,
  MAX_LOCATION_LIST_LIMIT,
  MAX_MICROWAVE_LINK_LIST_LIMIT,
  type MicrowaveLinkInclude,
  type OfficialLocationInclude,
  type Operator,
  type StationStatus,
} from "@openbts/shared/contract";

import {
  DEFAULT_MAP_FILTERS,
  IOT_RAT,
  type MapCountryCapability,
  type MapFilters,
  UNKNOWN_BAND_LABEL,
  hasCountryCapability,
  listAppliedMapBands,
  listOfficialRatFilters,
} from "./mapFilters";
import { type MapLookups, listBandIdsByLabels } from "./mapLookups";
import type { MicrowaveLinkListParams, OfficialLocationListParams } from "@/features/official/api";
import { toV2StationStatus } from "@/features/station-details/station/utils/stations";
import { MOST_LIST_VALUES, normalizeSearchText } from "@/lib/apiValues";
import type { StationStatus as V1StationStatus } from "@/types/station";

export type MapListRequest = {
  filters: MapFilters;
  lookups: MapLookups | undefined;
  limit: number;
  wantAzimuths: boolean;
  searchText?: string;
  listId?: string;
};

export type MapLocationsQuery = { source: "internal"; params: string | null } | { source: "official"; params: OfficialLocationListParams | null };

type RecentFilters = Pick<MapFilters, "recentDays" | "recentDateFields">;
type RegisterRecentParams = Pick<OfficialLocationListParams, "createdAfter" | "updatedAfter" | "changedAfter">;

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
const LIST_INCLUDE = "stations";
const LIST_INCLUDE_WITH_SECTORS = "stations,stations.sectors";
const REGISTER_INCLUDE: OfficialLocationInclude[] = ["sites", "sites.permits"];
const REGISTER_INCLUDE_WITH_SECTORS: OfficialLocationInclude[] = ["sites", "sites.permits", "sites.permits.sectors"];
const MICROWAVE_LINK_INCLUDE: MicrowaveLinkInclude[] = ["licensee"];

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
}

export function setRecentParams(params: URLSearchParams, { recentDays, recentDateFields }: RecentFilters): void {
  if (recentDays === null) return;

  params.set(recentDateFields.includes("updatedAt") ? "updatedAfter" : "createdAfter", getRecentCutoff(recentDays));
}

function clampPageSize(limit: number, maximum: number): number {
  return Math.min(maximum, Math.max(MIN_PAGE_SIZE, Math.round(limit)));
}

function buildStationFilterParams({ filters, lookups }: MapListRequest): URLSearchParams | null {
  const bandFilter = listBandFilterEntries(filters.bands, lookups?.bands);
  if (bandFilter === null) return null;

  const params = new URLSearchParams();
  const rats = listCellRats(filters.rat);

  params.set("statuses", listV2Statuses(filters.status).join(","));
  setOperatorParams(params, filters.operatorIds);
  if (filters.operatorIds.length > 0) params.set("keepOtherCountries", "true");
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
  params.set("limit", String(clampPageSize(limit, MAX_LOCATION_LIST_LIMIT)));
  return params.toString();
}

export function listCapableOperators(
  capability: MapCountryCapability,
  operatorIds: readonly number[],
  lookups: Pick<MapLookups, "operators" | "countries"> | undefined,
): Operator[] | null {
  if (operatorIds.length === 0) return [];
  if (lookups === undefined) return null;

  const chosenIds = new Set(operatorIds);
  return lookups.operators.filter(
    (operator) => chosenIds.has(operator.id) && hasCountryCapability(lookups.countries, operator.countryCode, capability),
  );
}

function toListParam<T>(values: readonly T[]): T[] | undefined {
  return values.length > 0 ? values.slice(0, MOST_LIST_VALUES) : undefined;
}

function toRegisterRecentParams({ recentDays, recentDateFields }: RecentFilters): RegisterRecentParams {
  if (recentDays === null) return {};

  const cutoff = getRecentCutoff(recentDays);
  const dateFields = recentDateFields.length > 0 ? recentDateFields : DEFAULT_MAP_FILTERS.recentDateFields;
  if (dateFields.includes("createdAt") && dateFields.includes("updatedAt")) return { changedAfter: cutoff };
  return dateFields.includes("updatedAt") ? { updatedAfter: cutoff } : { createdAfter: cutoff };
}

export function buildRegisterListParams({ filters, lookups, limit, wantAzimuths, listId }: MapListRequest): OfficialLocationListParams | null {
  const registerOperators = listCapableOperators("official", filters.operatorIds, lookups);
  if (registerOperators === null) return null;

  const operatorIds = toListParam(sortIds(registerOperators.map((operator) => operator.id)));

  return {
    operatorIds,
    keepOtherCountries: operatorIds === undefined ? undefined : true,
    rats: toListParam(listOfficialRatFilters(filters.rat)),
    bandLabels: toListParam(sortIds(listAppliedMapBands(filters))),
    ...toRegisterRecentParams(filters),
    listId,
    include: wantAzimuths ? REGISTER_INCLUDE_WITH_SECTORS : REGISTER_INCLUDE,
    includeTotal: true,
    limit: clampPageSize(limit, MAX_LOCATION_LIST_LIMIT),
  };
}

export function buildMapLocationsQuery(request: MapListRequest): MapLocationsQuery {
  if (request.filters.source === "official") return { source: "official", params: buildRegisterListParams(request) };
  return { source: "internal", params: buildMapListParams(request) };
}

export function buildMicrowaveLinkListParams(
  { radiolineOperators, recentDays }: Pick<MapFilters, "radiolineOperators" | "recentDays">,
  limit: number,
  listId?: string,
): MicrowaveLinkListParams {
  return {
    licenseeIds: toListParam(sortIds(radiolineOperators)),
    createdAfter: recentDays === null ? undefined : getRecentCutoff(recentDays),
    listId,
    include: MICROWAVE_LINK_INCLUDE,
    includeTotal: true,
    limit: clampPageSize(limit, MAX_MICROWAVE_LINK_LIST_LIMIT),
  };
}
