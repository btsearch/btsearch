import type { StationStatus, StructureType } from "@openbts/shared/contract";

import { FIRST_LIST_PAGE } from "./listPaging";
import { type ListScope, keepBandLabelsInPlans, listCountryCodesInPlay, listCountryOptionCodes, narrowListToCountries } from "./listScope";
import { DEFAULT_LIST_STATION_STATUSES, LIST_STATION_STATUSES, isDefaultListStationStatuses } from "./listStationStatuses";
import { RAT_OPTIONS } from "@/features/map/constants";
import { DEFAULT_MAP_FILTERS, type MapFilters, type MapFiltersChange, type MapRecentDateField } from "@/features/map/data/mapFilters";
import type { MapBandLabelsByCountry } from "@/features/map/data/mapLookups";
import { toV1StationStatus } from "@/features/station-details/station/utils/stations";
import type { UplinkType } from "@/types/station";

export type StationsListVariant = "public" | "admin";
export type StationsListSortColumn = "siteId" | "updated" | "created";
export type StationsListSort = "siteId" | "-siteId" | "updated" | "-updated" | "created" | "-created";
export type StationsListMissing = "photos" | "sectors" | "structure" | "unconfirmed";

export type StationsListFilters = {
  countryCodes: string[];
  operatorIds: number[];
  regionIds: number[];
  rats: string[];
  bands: number[];
  statuses: StationStatus[];
  structureTypes: StructureType[];
  uplinkTypes: UplinkType[];
  recentDays: number | null;
  recentDateFields: MapRecentDateField[];
  missing: StationsListMissing[];
  searchText: string;
  sort: StationsListSort | null;
  page: number;
  pageSize: number | null;
};

export type StationsListFiltersChange = StationsListFilters | ((current: StationsListFilters) => StationsListFilters);

export type StationsListSortState = {
  column: StationsListSortColumn | null;
  isDescending: boolean;
  isByRelevance: boolean;
};

type StationsListCountryScope = ListScope & {
  labelsByCountry: MapBandLabelsByCountry;
};

type SortParts = {
  column: StationsListSortColumn;
  isDescending: boolean;
};

type ColumnSorts = {
  ascending: StationsListSort;
  descending: StationsListSort;
  startsDescending: boolean;
};

const SORT_PARTS: Record<StationsListSort, SortParts> = {
  siteId: { column: "siteId", isDescending: false },
  "-siteId": { column: "siteId", isDescending: true },
  updated: { column: "updated", isDescending: false },
  "-updated": { column: "updated", isDescending: true },
  created: { column: "created", isDescending: false },
  "-created": { column: "created", isDescending: true },
};
const COLUMN_SORTS: Record<StationsListSortColumn, ColumnSorts> = {
  siteId: { ascending: "siteId", descending: "-siteId", startsDescending: false },
  updated: { ascending: "updated", descending: "-updated", startsDescending: true },
  created: { ascending: "created", descending: "-created", startsDescending: true },
};
const BY_RELEVANCE: StationsListSortState = { column: null, isDescending: false, isByRelevance: true };
const mapFiltersByListFilters = new WeakMap<StationsListFilters, MapFilters>();

export const STATIONS_LIST_RATS: readonly string[] = RAT_OPTIONS.map((rat) => rat.value);
export const STATIONS_LIST_MISSING: readonly StationsListMissing[] = ["photos", "sectors", "structure", "unconfirmed"];
export const STATIONS_LIST_SORTS: readonly StationsListSort[] = Object.values(COLUMN_SORTS).flatMap((sorts) => [sorts.ascending, sorts.descending]);
export const DEFAULT_STATIONS_LIST_SORT: StationsListSort = "-updated";

export const DEFAULT_STATIONS_LIST_FILTERS: StationsListFilters = {
  countryCodes: [],
  operatorIds: [],
  regionIds: [],
  rats: [],
  bands: [],
  statuses: [...DEFAULT_LIST_STATION_STATUSES],
  structureTypes: [],
  uplinkTypes: [],
  recentDays: null,
  recentDateFields: [...DEFAULT_MAP_FILTERS.recentDateFields],
  missing: [],
  searchText: "",
  sort: null,
  page: FIRST_LIST_PAGE,
  pageSize: null,
};

function toggleInOrder<Value>(valuesInOrder: readonly Value[], chosen: readonly Value[], value: Value): Value[] {
  return valuesInOrder.filter((entry) => (entry === value) !== chosen.includes(entry));
}

export function hasStationsListSearchText(filters: Pick<StationsListFilters, "searchText">): boolean {
  return filters.searchText.trim() !== "";
}

export function toStoredStationsListSort(sort: StationsListSort | null, searchText: string): StationsListSort | null {
  return sort === DEFAULT_STATIONS_LIST_SORT && searchText.trim() === "" ? null : sort;
}

export function getStationsListSortState(filters: Pick<StationsListFilters, "sort" | "searchText">): StationsListSortState {
  const sort = filters.sort ?? (hasStationsListSearchText(filters) ? null : DEFAULT_STATIONS_LIST_SORT);
  if (sort === null) return BY_RELEVANCE;

  const { column, isDescending } = SORT_PARTS[sort];
  return { column, isDescending, isByRelevance: false };
}

export function pickStationsListSort(filters: StationsListFilters, column: StationsListSortColumn): StationsListFilters {
  const current = getStationsListSortState(filters);
  const sorts = COLUMN_SORTS[column];
  const isDescending = current.column === column ? !current.isDescending : sorts.startsDescending;

  return { ...filters, sort: toStoredStationsListSort(isDescending ? sorts.descending : sorts.ascending, filters.searchText) };
}

export function setStationsListSearchText(filters: StationsListFilters, searchText: string): StationsListFilters {
  const isEnteringSearch = !hasStationsListSearchText(filters) && searchText.trim() !== "";
  const sort = isEnteringSearch ? null : toStoredStationsListSort(filters.sort, searchText);

  return { ...filters, searchText, sort };
}

export function toggleStationsListStatus(filters: StationsListFilters, status: StationStatus): StationsListFilters {
  const statuses = toggleInOrder(LIST_STATION_STATUSES, filters.statuses, status);
  return statuses.length === 0 ? filters : { ...filters, statuses };
}

export function toggleStationsListMissing(filters: StationsListFilters, missing: StationsListMissing): StationsListFilters {
  return { ...filters, missing: toggleInOrder(STATIONS_LIST_MISSING, filters.missing, missing) };
}

export function countActiveStationsListFilters(filters: StationsListFilters): number {
  return (
    filters.countryCodes.length +
    filters.operatorIds.length +
    filters.regionIds.length +
    filters.rats.length +
    filters.bands.length +
    (isDefaultListStationStatuses(filters.statuses) ? 0 : filters.statuses.length) +
    filters.structureTypes.length +
    filters.uplinkTypes.length +
    (filters.recentDays === null ? 0 : 1) +
    filters.missing.length
  );
}

export function clearStationsListFilters(filters: StationsListFilters): StationsListFilters {
  return { ...DEFAULT_STATIONS_LIST_FILTERS, searchText: filters.searchText, sort: filters.sort, pageSize: filters.pageSize };
}

export function clearStationsListFiltersAndText(filters: StationsListFilters): StationsListFilters {
  return { ...DEFAULT_STATIONS_LIST_FILTERS, pageSize: filters.pageSize };
}

function getStationsListCriteriaKey(filters: StationsListFilters): string {
  return JSON.stringify([
    filters.countryCodes,
    filters.operatorIds,
    filters.regionIds,
    filters.rats,
    filters.bands,
    filters.statuses,
    filters.structureTypes,
    filters.uplinkTypes,
    filters.recentDays,
    filters.recentDateFields,
    filters.missing,
    filters.searchText,
    filters.sort,
  ]);
}

export function getStationsListFiltersKey(filters: StationsListFilters): string {
  return JSON.stringify([getStationsListCriteriaKey(filters), filters.page, filters.pageSize]);
}

export function moveStationsListToFirstPage(current: StationsListFilters, next: StationsListFilters): StationsListFilters {
  if (next.page !== current.page || getStationsListCriteriaKey(current) === getStationsListCriteriaKey(next)) return next;
  return { ...next, page: FIRST_LIST_PAGE };
}

export function pickStationsListCountries(
  filters: StationsListFilters,
  countryCodes: readonly string[],
  scope: StationsListCountryScope,
): StationsListFilters {
  const narrowed = narrowListToCountries(filters, countryCodes, scope);
  if (scope.lookups === undefined || scope.area === undefined) return narrowed;

  const countryCodesInPlay = listCountryCodesInPlay(narrowed.countryCodes, listCountryOptionCodes(scope.lookups, scope.area));
  return { ...narrowed, bands: keepBandLabelsInPlans(narrowed.bands, countryCodesInPlay, scope.labelsByCountry) };
}

export function toMapPanelFilters(filters: StationsListFilters): MapFilters {
  const knownFilters = mapFiltersByListFilters.get(filters);
  if (knownFilters !== undefined) return knownFilters;

  const mapFilters: MapFilters = {
    ...DEFAULT_MAP_FILTERS,
    operatorIds: filters.operatorIds,
    countryCodes: filters.countryCodes,
    bands: filters.bands,
    rat: filters.rats,
    status: filters.statuses.map(toV1StationStatus),
    recentDays: filters.recentDays,
    recentDateFields: filters.recentDateFields,
    uplinkTypes: filters.uplinkTypes,
  };
  mapFiltersByListFilters.set(filters, mapFilters);
  return mapFilters;
}

export function applyMapPanelChange(filters: StationsListFilters, change: MapFiltersChange): StationsListFilters {
  const current = toMapPanelFilters(filters);
  const next = typeof change === "function" ? change(current) : change;
  if (next === current) return filters;

  const statuses = LIST_STATION_STATUSES.filter((status) => next.status.includes(toV1StationStatus(status)));
  return {
    ...filters,
    operatorIds: next.operatorIds,
    countryCodes: next.countryCodes,
    bands: next.bands,
    rats: next.rat,
    statuses: statuses.length > 0 ? statuses : filters.statuses,
    recentDays: next.recentDays,
    recentDateFields: next.recentDateFields,
    uplinkTypes: next.uplinkTypes,
  };
}
