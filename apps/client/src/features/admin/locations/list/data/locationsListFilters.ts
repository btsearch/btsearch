import type { StructureType } from "@openbts/shared/contract";

import { DEFAULT_MAP_FILTERS, type MapFilters, type MapFiltersChange } from "@/features/map/data/mapFilters";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";
import { toggleValue } from "@/lib/utils";

export type LocationsListSortColumn = "id" | "updated" | "created";
export type LocationsListSort = "id" | "-id" | "updated" | "-updated" | "created" | "-created";

export type LocationsListFilters = {
  countryCodes: string[];
  operatorIds: number[];
  regionIds: number[];
  structureTypes: StructureType[];
  structureOwnerIds: number[];
  isWithoutStations: boolean;
  searchText: string;
  sort: LocationsListSort;
  page: number;
  pageSize: number | null;
};

export type LocationsListFiltersChange = LocationsListFilters | ((current: LocationsListFilters) => LocationsListFilters);

export type LocationsListSortState = {
  column: LocationsListSortColumn;
  isDescending: boolean;
};

type ColumnSorts = {
  ascending: LocationsListSort;
  descending: LocationsListSort;
};

const SORT_STATES: Record<LocationsListSort, LocationsListSortState> = {
  id: { column: "id", isDescending: false },
  "-id": { column: "id", isDescending: true },
  updated: { column: "updated", isDescending: false },
  "-updated": { column: "updated", isDescending: true },
  created: { column: "created", isDescending: false },
  "-created": { column: "created", isDescending: true },
};
const COLUMN_SORTS: Record<LocationsListSortColumn, ColumnSorts> = {
  id: { ascending: "id", descending: "-id" },
  updated: { ascending: "updated", descending: "-updated" },
  created: { ascending: "created", descending: "-created" },
};
const mapFiltersByListFilters = new WeakMap<LocationsListFilters, MapFilters>();

export const LOCATIONS_LIST_SORTS: readonly LocationsListSort[] = Object.values(COLUMN_SORTS).flatMap((sorts) => [sorts.ascending, sorts.descending]);
export const DEFAULT_LOCATIONS_LIST_SORT: LocationsListSort = "-updated";

const DEFAULT_LOCATIONS_LIST_FILTERS: LocationsListFilters = {
  countryCodes: [],
  operatorIds: [],
  regionIds: [],
  structureTypes: [],
  structureOwnerIds: [],
  isWithoutStations: false,
  searchText: "",
  sort: DEFAULT_LOCATIONS_LIST_SORT,
  page: FIRST_LIST_PAGE,
  pageSize: null,
};

export function getLocationsListSortState(filters: Pick<LocationsListFilters, "sort">): LocationsListSortState {
  return SORT_STATES[filters.sort];
}

export function pickLocationsListSort(filters: LocationsListFilters, column: LocationsListSortColumn): LocationsListFilters {
  const current = SORT_STATES[filters.sort];
  const isDescending = current.column === column ? !current.isDescending : true;

  return { ...filters, sort: isDescending ? COLUMN_SORTS[column].descending : COLUMN_SORTS[column].ascending };
}

export function toggleLocationsListOperator(filters: LocationsListFilters, operatorId: number): LocationsListFilters {
  const operatorIds = toggleValue(filters.operatorIds, operatorId);
  const isPickingOperator = operatorIds.length > filters.operatorIds.length;

  return { ...filters, operatorIds, isWithoutStations: isPickingOperator ? false : filters.isWithoutStations };
}

export function toggleLocationsListWithoutStations(filters: LocationsListFilters): LocationsListFilters {
  if (filters.isWithoutStations) return { ...filters, isWithoutStations: false };
  return { ...filters, isWithoutStations: true, operatorIds: [] };
}

export function countActiveLocationsListFilters(filters: LocationsListFilters): number {
  return (
    filters.countryCodes.length +
    filters.operatorIds.length +
    filters.regionIds.length +
    filters.structureTypes.length +
    filters.structureOwnerIds.length +
    (filters.isWithoutStations ? 1 : 0)
  );
}

export function clearLocationsListFilters(filters: LocationsListFilters): LocationsListFilters {
  return { ...DEFAULT_LOCATIONS_LIST_FILTERS, searchText: filters.searchText, sort: filters.sort, pageSize: filters.pageSize };
}

export function clearLocationsListFiltersAndText(filters: LocationsListFilters): LocationsListFilters {
  return { ...DEFAULT_LOCATIONS_LIST_FILTERS, sort: filters.sort, pageSize: filters.pageSize };
}

function getLocationsListCriteriaKey(filters: LocationsListFilters): string {
  return JSON.stringify([
    filters.countryCodes,
    filters.operatorIds,
    filters.regionIds,
    filters.structureTypes,
    filters.structureOwnerIds,
    filters.isWithoutStations,
    filters.searchText,
    filters.sort,
  ]);
}

export function getLocationsListFiltersKey(filters: LocationsListFilters): string {
  return JSON.stringify([getLocationsListCriteriaKey(filters), filters.page, filters.pageSize]);
}

export function moveLocationsListToFirstPage(current: LocationsListFilters, next: LocationsListFilters): LocationsListFilters {
  if (next.page !== current.page || getLocationsListCriteriaKey(current) === getLocationsListCriteriaKey(next)) return next;
  return { ...next, page: FIRST_LIST_PAGE };
}

export function toMapOperatorFilters(filters: LocationsListFilters): MapFilters {
  const knownFilters = mapFiltersByListFilters.get(filters);
  if (knownFilters !== undefined) return knownFilters;

  const mapFilters: MapFilters = { ...DEFAULT_MAP_FILTERS, operatorIds: filters.operatorIds, countryCodes: filters.countryCodes };
  mapFiltersByListFilters.set(filters, mapFilters);
  return mapFilters;
}

export function applyMapOperatorChange(filters: LocationsListFilters, change: MapFiltersChange): LocationsListFilters {
  const current = toMapOperatorFilters(filters);
  const next = typeof change === "function" ? change(current) : change;
  return next === current ? filters : { ...filters, operatorIds: next.operatorIds };
}
