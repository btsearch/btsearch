import { DEFAULT_LOCATIONS_LIST_SORT, LOCATIONS_LIST_SORTS, type LocationsListFilters, type LocationsListSort } from "./locationsListFilters";
import { FIRST_LIST_PAGE, LAST_LIST_PAGE, LIST_PAGE_SIZE_LIMIT, SMALLEST_LIST_PAGE_SIZE } from "@/features/stations/list/data/listPaging";
import { LIST_STRUCTURE_TYPES } from "@/features/stations/list/data/listStructures";
import {
  type ListUrlSearch,
  decodeUrlText,
  encodeUrlText,
  joinUrlValues,
  orderWords,
  parseUrlCountryCodes,
  parseUrlEnum,
  parseUrlIds,
  parseUrlNumber,
  sortUniqueCountryCodes,
  sortUniqueNumbers,
  toWrittenListSearch,
} from "@/features/stations/list/data/listUrlValues";
import { normalizeSearchText } from "@/lib/apiValues";

type WithoutStationsWord = "none";

export type LocationsListSearch = {
  q?: string;
  countries?: string;
  operators?: string;
  regions?: string;
  structures?: string;
  owners?: string;
  stations?: WithoutStationsWord;
  sort?: LocationsListSort;
  page?: number;
  size?: number;
};

const WITHOUT_STATIONS_WORDS: readonly WithoutStationsWord[] = ["none"];

export function readLocationsListFilters(search: ListUrlSearch): LocationsListFilters {
  const [sort = DEFAULT_LOCATIONS_LIST_SORT] = parseUrlEnum(search.sort, LOCATIONS_LIST_SORTS);

  return {
    countryCodes: parseUrlCountryCodes(search.countries),
    operatorIds: parseUrlIds(search.operators),
    regionIds: parseUrlIds(search.regions),
    structureTypes: parseUrlEnum(search.structures, LIST_STRUCTURE_TYPES),
    structureOwnerIds: parseUrlIds(search.owners),
    isWithoutStations: parseUrlEnum(search.stations, WITHOUT_STATIONS_WORDS).length > 0,
    searchText: normalizeSearchText(decodeUrlText(search.q)),
    sort,
    page: parseUrlNumber(search.page, FIRST_LIST_PAGE, LAST_LIST_PAGE) ?? FIRST_LIST_PAGE,
    pageSize: parseUrlNumber(search.size, SMALLEST_LIST_PAGE_SIZE, LIST_PAGE_SIZE_LIMIT) ?? null,
  };
}

export function toLocationsListSearch(filters: LocationsListFilters): LocationsListSearch {
  const searchText = normalizeSearchText(filters.searchText);

  return {
    q: encodeUrlText(searchText),
    countries: joinUrlValues(sortUniqueCountryCodes(filters.countryCodes)),
    operators: joinUrlValues(sortUniqueNumbers(filters.operatorIds)),
    regions: joinUrlValues(sortUniqueNumbers(filters.regionIds)),
    structures: joinUrlValues(orderWords(LIST_STRUCTURE_TYPES, filters.structureTypes)),
    owners: joinUrlValues(sortUniqueNumbers(filters.structureOwnerIds)),
    stations: filters.isWithoutStations ? "none" : undefined,
    sort: filters.sort === DEFAULT_LOCATIONS_LIST_SORT ? undefined : filters.sort,
    page: filters.page > FIRST_LIST_PAGE ? filters.page : undefined,
    size: filters.pageSize ?? undefined,
  };
}

export function parseLocationsListSearch(search: Record<string, unknown>): LocationsListSearch {
  return toLocationsListSearch(readLocationsListFilters(toWrittenListSearch(search)));
}
