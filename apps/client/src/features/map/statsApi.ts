import type { CountryStatistics } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { fetchV2Data } from "@/lib/api";

export type MapDataDates = {
  database: string | null;
  register: string | null;
};

const STATISTICS_STALE_TIME = 1000 * 60 * 10;
const NO_DATA_DATES: MapDataDates = { database: null, register: null };

function fetchCountryStatistics(signal?: AbortSignal): Promise<CountryStatistics[]> {
  return fetchV2Data<CountryStatistics[]>("statistics", { signal });
}

function findLatestInstant(instants: readonly (string | null)[]): string | null {
  let latest: string | null = null;
  for (const instant of instants) {
    if (instant !== null && (latest === null || instant > latest)) latest = instant;
  }
  return latest;
}

export function countryStatisticsQueryOptions() {
  return queryOptions({
    queryKey: ["stats"] as const,
    queryFn: ({ signal }) => fetchCountryStatistics(signal),
    staleTime: STATISTICS_STALE_TIME,
  });
}

export function readMapDataDates(statistics: readonly CountryStatistics[] | undefined, countryCodes: readonly string[]): MapDataDates {
  if (statistics === undefined) return NO_DATA_DATES;

  const shown = countryCodes.length === 0 ? statistics : statistics.filter((country) => countryCodes.includes(country.countryCode));
  return {
    database: findLatestInstant(shown.map((country) => country.updatedAt)),
    register: findLatestInstant(statistics.map((country) => country.official?.permitsImportedAt ?? null)),
  };
}
