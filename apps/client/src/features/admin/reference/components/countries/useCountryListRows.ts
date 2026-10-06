import { usePrefetchQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { bandPlanQueryOptions } from "../../api/bandPlan";
import { countryStatisticsQueryOptions } from "../../api/statistics";
import { teamGrantsQueryOptions } from "../../api/team";
import type { Country, CountryStatistics, TeamGrant } from "../../types";
import { type Loadable, toLoadable } from "../shared/loadable";
import { countriesQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { getCountryName } from "@/lib/geo/countryName";

type CountryListTeam = {
  maintainers: number;
  editors: number;
};

export type CountryListRow = {
  country: Country;
  name: string;
  regionCount: Loadable<number>;
  operatorCount: Loadable<number>;
  planSize: Loadable<number>;
  team: Loadable<CountryListTeam>;
  activeStations: Loadable<number>;
};

type CountryRecord = {
  countryCode: string;
};

type CountryAccessCheck = (countryCode: string) => boolean;

type PlanQueryState = {
  data: number[] | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

type CountryPlans = {
  sizes: Loadable<number>[];
  hasFailed: boolean;
  isFetching: boolean;
  failedRefetches: (() => unknown)[];
};

const NO_COUNTRIES: Country[] = [];
const NO_TEAM: CountryListTeam = { maintainers: 0, editors: 0 };

function listOpenCountries(countries: readonly Country[], canOpenCountry: CountryAccessCheck): Country[] {
  return countries.filter((country) => canOpenCountry(country.code));
}

function listOpenCountryCodes(countries: readonly Country[], canOpenCountry: CountryAccessCheck): string[] {
  return listOpenCountries(countries, canOpenCountry).map((country) => country.code);
}

function countByCountry(records: readonly CountryRecord[] | undefined): Map<string, number> | undefined {
  if (records === undefined) return undefined;

  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.countryCode, (counts.get(record.countryCode) ?? 0) + 1);
  return counts;
}

function groupTeams(grants: readonly TeamGrant[] | undefined): Map<string, CountryListTeam> | undefined {
  if (grants === undefined) return undefined;

  const teams = new Map<string, CountryListTeam>();
  for (const grant of grants) {
    const team = teams.get(grant.countryCode) ?? { maintainers: 0, editors: 0 };
    if (grant.role === "maintainer") team.maintainers += 1;
    else team.editors += 1;
    teams.set(grant.countryCode, team);
  }
  return teams;
}

function indexActiveStations(statistics: readonly CountryStatistics[] | undefined): Map<string, number> | undefined {
  if (statistics === undefined) return undefined;
  return new Map(statistics.map((countryStatistics) => [countryStatistics.countryCode, countryStatistics.stations.active]));
}

function toCountryDetail<T>(details: ReadonlyMap<string, T> | undefined, countryCode: string, fallback: T, hasLoadFailed: boolean): Loadable<T> {
  return toLoadable(details === undefined ? undefined : (details.get(countryCode) ?? fallback), hasLoadFailed);
}

function compareRows(left: CountryListRow, right: CountryListRow, language: string): number {
  return Number(right.country.isVisible) - Number(left.country.isVisible) || left.name.localeCompare(right.name, language);
}

function combinePlanQueries(planQueries: readonly PlanQueryState[]): CountryPlans {
  return {
    sizes: planQueries.map((planQuery) => toLoadable(planQuery.data?.length, planQuery.isError)),
    hasFailed: planQueries.some((planQuery) => planQuery.isError),
    isFetching: planQueries.some((planQuery) => planQuery.isFetching),
    failedRefetches: planQueries.filter((planQuery) => planQuery.isError).map((planQuery) => planQuery.refetch),
  };
}

export function useCountryListPreload() {
  usePrefetchQuery(countriesQueryOptions());
  usePrefetchQuery(regionsQueryOptions());
  usePrefetchQuery(operatorsQueryOptions());
  usePrefetchQuery(countryStatisticsQueryOptions());
}

export function useCountryListRows(canOpenCountry: CountryAccessCheck) {
  const { i18n } = useTranslation();
  const countriesQuery = useQuery(countriesQueryOptions());
  const regionsQuery = useQuery(regionsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const statisticsQuery = useQuery(countryStatisticsQueryOptions());
  const allCountries = countriesQuery.data ?? NO_COUNTRIES;
  const teamQuery = useQuery({
    ...teamGrantsQueryOptions(listOpenCountryCodes(allCountries, canOpenCountry)),
    enabled: countriesQuery.data !== undefined,
  });
  const plans = useQueries({
    queries: listOpenCountryCodes(allCountries, canOpenCountry).map((countryCode) => bandPlanQueryOptions(countryCode)),
    combine: combinePlanQueries,
  });

  const language = i18n.language;
  const regionCounts = countByCountry(regionsQuery.data);
  const operatorCounts = countByCountry(operatorsQuery.data);
  const teams = groupTeams(teamQuery.data);
  const activeStations = indexActiveStations(statisticsQuery.data);

  const rows = listOpenCountries(allCountries, canOpenCountry)
    .map((country, index): CountryListRow => ({
      country,
      name: getCountryName(country.code, language),
      regionCount: toCountryDetail(regionCounts, country.code, 0, regionsQuery.isError),
      operatorCount: toCountryDetail(operatorCounts, country.code, 0, operatorsQuery.isError),
      planSize: plans.sizes[index],
      team: toCountryDetail(teams, country.code, NO_TEAM, teamQuery.isError),
      activeStations: toCountryDetail(activeStations, country.code, 0, statisticsQuery.isError),
    }))
    .sort((left, right) => compareRows(left, right, language));

  function retryDetails() {
    if (regionsQuery.isError) void regionsQuery.refetch();
    if (operatorsQuery.isError) void operatorsQuery.refetch();
    if (statisticsQuery.isError) void statisticsQuery.refetch();
    if (teamQuery.isError) void teamQuery.refetch();
    for (const refetchPlan of plans.failedRefetches) void refetchPlan();
  }

  return {
    rows,
    existingCountryCodes: allCountries.map((country) => country.code),
    isLoading: countriesQuery.isPending,
    hasLoadFailed: countriesQuery.isLoadingError,
    hasStaleRows: countriesQuery.isRefetchError,
    isFetching: countriesQuery.isFetching,
    refetch: countriesQuery.refetch,
    haveDetailsFailed: regionsQuery.isError || operatorsQuery.isError || statisticsQuery.isError || teamQuery.isError || plans.hasFailed,
    isRetryingDetails: regionsQuery.isFetching || operatorsQuery.isFetching || statisticsQuery.isFetching || teamQuery.isFetching || plans.isFetching,
    retryDetails,
  };
}
