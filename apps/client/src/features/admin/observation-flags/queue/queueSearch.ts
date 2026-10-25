import type { ObservationFlagKind, ObservationFlagSort, ObservationFlagStatus } from "@openbts/shared/contract";

import type { FlagListParams } from "../api/keys";
import { isFlagKind } from "../model/kinds";
import { joinSearchValues, listSearchValues, parseSearchQuery, parseSearchValues, parseSearchWholeNumber } from "@/lib/urlSearch";

type ShownSort = Exclude<ObservationFlagSort, typeof DEFAULT_SORT>;

type FlagsQueueSearch = {
  status?: Exclude<ObservationFlagStatus, "open">;
  kinds?: string;
  countries?: string;
  regions?: string;
  operators?: string;
  station?: string;
  stations?: string;
  sort?: ShownSort;
  flag?: number;
};

export type FlagsQueueCriteria = {
  status: ObservationFlagStatus;
  kinds: ObservationFlagKind[];
  countryCodes: string[];
  regionIds: number[];
  operatorIds: number[];
  station: string;
  stationIds: number[];
  sort: ObservationFlagSort;
  flagId: number | null;
};

export const QUEUE_SORTS = ["-createdAt", "createdAt", "-updatedAt", "stationId"] as const satisfies readonly ObservationFlagSort[];
export const QUEUE_STATUSES: readonly ObservationFlagStatus[] = ["open", "resolved", "dismissed"];
export const STATION_SEARCH_MAX_LENGTH = 64;

const DEFAULT_SORT = "-createdAt";
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const LARGEST_ID = Number.MAX_SAFE_INTEGER;

function parseIds(value: unknown): number[] {
  const ids = new Set<number>();
  for (const item of listSearchValues(value)) {
    const id = Number(item);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return [...ids].sort((left, right) => left - right);
}

function joinIds(ids: readonly number[]): string | undefined {
  return joinSearchValues(ids.map(String));
}

function parseCountryCode(item: string): string | null {
  const code = item.trim().toUpperCase();
  return COUNTRY_CODE_PATTERN.test(code) ? code : null;
}

function parseKinds(value: unknown): ObservationFlagKind[] {
  return parseSearchValues(value, (item) => (isFlagKind(item) ? item : null)).filter(isFlagKind);
}

function parseStatus(value: unknown): FlagsQueueSearch["status"] {
  return value === "resolved" || value === "dismissed" ? value : undefined;
}

function isShownSort(value: unknown): value is ShownSort {
  return QUEUE_SORTS.some((sort) => sort !== DEFAULT_SORT && sort === value);
}

export function parseFlagsQueueSearch(search: Record<string, unknown>): FlagsQueueSearch {
  return {
    status: parseStatus(search.status),
    kinds: joinSearchValues(parseKinds(search.kinds)),
    countries: joinSearchValues(parseSearchValues(search.countries, parseCountryCode)),
    regions: joinIds(parseIds(search.regions)),
    operators: joinIds(parseIds(search.operators)),
    station: parseSearchQuery(search.station)?.slice(0, STATION_SEARCH_MAX_LENGTH),
    stations: joinIds(parseIds(search.stations)),
    sort: isShownSort(search.sort) ? search.sort : undefined,
    flag: parseSearchWholeNumber(search.flag, 1, LARGEST_ID),
  };
}

export function readFlagsQueueCriteria(search: FlagsQueueSearch): FlagsQueueCriteria {
  return {
    status: search.status ?? "open",
    kinds: parseKinds(search.kinds),
    countryCodes: parseSearchValues(search.countries, parseCountryCode),
    regionIds: parseIds(search.regions),
    operatorIds: parseIds(search.operators),
    station: search.station ?? "",
    stationIds: parseIds(search.stations),
    sort: search.sort ?? DEFAULT_SORT,
    flagId: search.flag ?? null,
  };
}

export function toFlagsQueueSearch(criteria: FlagsQueueCriteria): FlagsQueueSearch {
  const station = criteria.station.trim();
  return {
    status: criteria.status === "open" ? undefined : criteria.status,
    kinds: joinSearchValues(criteria.kinds),
    countries: joinSearchValues(criteria.countryCodes),
    regions: joinIds(criteria.regionIds),
    operators: joinIds(criteria.operatorIds),
    station: station === "" ? undefined : station,
    stations: joinIds(criteria.stationIds),
    sort: isShownSort(criteria.sort) ? criteria.sort : undefined,
    flag: criteria.flagId ?? undefined,
  };
}

export function toFlagListParams(criteria: FlagsQueueCriteria): FlagListParams {
  return {
    status: criteria.status,
    kinds: criteria.kinds,
    countryCodes: criteria.countryCodes,
    regionIds: criteria.regionIds,
    operatorIds: criteria.operatorIds,
    station: criteria.station,
    stationIds: criteria.stationIds,
    sort: criteria.sort,
  };
}
