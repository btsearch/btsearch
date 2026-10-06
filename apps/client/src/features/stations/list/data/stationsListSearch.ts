import type { Operator } from "@openbts/shared/contract";

import { FIRST_LIST_PAGE, LAST_LIST_PAGE, LIST_PAGE_SIZE_LIMIT, SMALLEST_LIST_PAGE_SIZE } from "./listPaging";
import { DEFAULT_LIST_STATION_STATUSES, LIST_STATION_STATUSES, isDefaultListStationStatuses } from "./listStationStatuses";
import { LIST_STRUCTURE_TYPES } from "./listStructures";
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
  parseUrlNumbers,
  sortUniqueCountryCodes,
  sortUniqueNumbers,
  toWrittenListSearch,
} from "./listUrlValues";
import {
  DEFAULT_STATIONS_LIST_FILTERS,
  STATIONS_LIST_MISSING,
  STATIONS_LIST_RATS,
  STATIONS_LIST_SORTS,
  type StationsListFilters,
  type StationsListSort,
  type StationsListVariant,
  toStoredStationsListSort,
} from "./stationsListFilters";
import { type MapRecentDateField, UNKNOWN_BAND_LABEL } from "@/features/map/data/mapFilters";
import { normalizeSearchText } from "@/lib/apiValues";
import { UPLINK_TYPES } from "@/lib/format/uplink";

type RecentDateWord = "created" | "updated";

export type StationsListSearch = {
  q?: string;
  countries?: string;
  operators?: string;
  regions?: string;
  rats?: string;
  bands?: string;
  statuses?: string;
  structures?: string;
  uplink?: string;
  recentDays?: number;
  recentDates?: string;
  missing?: string;
  sort?: StationsListSort;
  page?: number;
  size?: number;
};

const SMALLEST_RECENT_DAYS = 1;
const LARGEST_RECENT_DAYS = 30;
const LARGEST_BAND_LABEL = 2_147_483_647;
const RECENT_DATE_WORDS: readonly RecentDateWord[] = ["created", "updated"];
const RECENT_DATE_FIELDS: Record<RecentDateWord, MapRecentDateField> = { created: "createdAt", updated: "updatedAt" };

function readRecentDateFields(value: unknown): MapRecentDateField[] {
  return parseUrlEnum(value, RECENT_DATE_WORDS).map((word) => RECENT_DATE_FIELDS[word]);
}

function listRecentDateWords(fields: readonly MapRecentDateField[]): RecentDateWord[] {
  return RECENT_DATE_WORDS.filter((word) => fields.includes(RECENT_DATE_FIELDS[word]));
}

function hasDefaultRecentDateFields(fields: readonly MapRecentDateField[]): boolean {
  const defaultFields = DEFAULT_STATIONS_LIST_FILTERS.recentDateFields;
  return fields.length === defaultFields.length && defaultFields.every((field) => fields.includes(field));
}

export function readStationsListFilters(search: ListUrlSearch, variant: StationsListVariant): StationsListFilters {
  const searchText = normalizeSearchText(decodeUrlText(search.q));
  const statuses = parseUrlEnum(search.statuses, LIST_STATION_STATUSES);
  const recentDays = parseUrlNumber(search.recentDays, SMALLEST_RECENT_DAYS, LARGEST_RECENT_DAYS) ?? null;
  const recentDateFields = recentDays === null ? [] : readRecentDateFields(search.recentDates);
  const [sort = null] = parseUrlEnum(search.sort, STATIONS_LIST_SORTS);

  return {
    countryCodes: parseUrlCountryCodes(search.countries),
    operatorIds: parseUrlIds(search.operators),
    regionIds: parseUrlIds(search.regions),
    rats: parseUrlEnum(search.rats, STATIONS_LIST_RATS),
    bands: parseUrlNumbers(search.bands, UNKNOWN_BAND_LABEL, LARGEST_BAND_LABEL),
    statuses: statuses.length > 0 ? statuses : [...DEFAULT_LIST_STATION_STATUSES],
    structureTypes: parseUrlEnum(search.structures, LIST_STRUCTURE_TYPES),
    uplinkTypes: parseUrlEnum(search.uplink, UPLINK_TYPES),
    recentDays,
    recentDateFields: recentDateFields.length > 0 ? recentDateFields : [...DEFAULT_STATIONS_LIST_FILTERS.recentDateFields],
    missing: variant === "admin" ? parseUrlEnum(search.missing, STATIONS_LIST_MISSING) : [],
    searchText,
    sort: toStoredStationsListSort(sort, searchText),
    page: parseUrlNumber(search.page, FIRST_LIST_PAGE, LAST_LIST_PAGE) ?? FIRST_LIST_PAGE,
    pageSize: parseUrlNumber(search.size, SMALLEST_LIST_PAGE_SIZE, LIST_PAGE_SIZE_LIMIT) ?? null,
  };
}

export function toStationsListSearch(filters: StationsListFilters, variant: StationsListVariant): StationsListSearch {
  const searchText = normalizeSearchText(filters.searchText);
  const hasOwnRecentDates = filters.recentDays !== null && !hasDefaultRecentDateFields(filters.recentDateFields);

  return {
    q: encodeUrlText(searchText),
    countries: joinUrlValues(sortUniqueCountryCodes(filters.countryCodes)),
    operators: joinUrlValues(sortUniqueNumbers(filters.operatorIds)),
    regions: joinUrlValues(sortUniqueNumbers(filters.regionIds)),
    rats: joinUrlValues(orderWords(STATIONS_LIST_RATS, filters.rats)),
    bands: joinUrlValues(sortUniqueNumbers(filters.bands)),
    statuses: isDefaultListStationStatuses(filters.statuses) ? undefined : joinUrlValues(orderWords(LIST_STATION_STATUSES, filters.statuses)),
    structures: joinUrlValues(orderWords(LIST_STRUCTURE_TYPES, filters.structureTypes)),
    uplink: joinUrlValues(orderWords(UPLINK_TYPES, filters.uplinkTypes)),
    recentDays: filters.recentDays ?? undefined,
    recentDates: hasOwnRecentDates ? joinUrlValues(listRecentDateWords(filters.recentDateFields)) : undefined,
    missing: variant === "admin" ? joinUrlValues(orderWords(STATIONS_LIST_MISSING, filters.missing)) : undefined,
    sort: toStoredStationsListSort(filters.sort, searchText) ?? undefined,
    page: filters.page > FIRST_LIST_PAGE ? filters.page : undefined,
    size: filters.pageSize ?? undefined,
  };
}

export function toOperatorStationsListSearch(operator: Pick<Operator, "id" | "countryCode">): StationsListSearch {
  return toStationsListSearch({ ...DEFAULT_STATIONS_LIST_FILTERS, countryCodes: [operator.countryCode], operatorIds: [operator.id] }, "admin");
}

function parseStationsListSearch(search: ListUrlSearch, variant: StationsListVariant): StationsListSearch {
  return toStationsListSearch(readStationsListFilters(toWrittenListSearch(search), variant), variant);
}

export function parsePublicStationsListSearch(search: Record<string, unknown>): StationsListSearch {
  return parseStationsListSearch(search, "public");
}

export function parseAdminStationsListSearch(search: Record<string, unknown>): StationsListSearch {
  return parseStationsListSearch(search, "admin");
}
