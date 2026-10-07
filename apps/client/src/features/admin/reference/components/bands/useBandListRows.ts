import { useQueries, useQuery } from "@tanstack/react-query";

import { bandPlanQueryOptions } from "../../api/bandPlan";
import { stationBreakdownQueryOptions } from "../../api/statistics";
import type { Band, Country } from "../../types";
import { sumCellsByBand } from "../../utils/bands";
import { type Loadable, toLoadable } from "../shared/loadable";
import { type BandListCriteria, filterBands } from "./bandListCriteria";
import { bandsQueryOptions, countriesQueryOptions } from "@/features/shared/lookups";

export type BandListRow = {
  band: Band;
  planCountryCodes: Loadable<readonly string[]>;
  cellCount: Loadable<number>;
};

type BandPlan = readonly number[] | undefined;

type PlanQueryState = {
  data: BandPlan;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

type BandPlans = {
  plans: readonly BandPlan[] | null;
  hasFailed: boolean;
  isFetching: boolean;
  failedRefetches: (() => unknown)[];
};

const NO_BANDS: Band[] = [];
const NO_COUNTRIES: Country[] = [];
const NO_COUNTRY_CODES: readonly string[] = [];

function combinePlanQueries(planQueries: readonly PlanQueryState[]): BandPlans {
  const plans = planQueries.map((planQuery) => planQuery.data);

  return {
    plans: plans.includes(undefined) ? null : plans,
    hasFailed: planQueries.some((planQuery) => planQuery.isError),
    isFetching: planQueries.some((planQuery) => planQuery.isFetching),
    failedRefetches: planQueries.filter((planQuery) => planQuery.isError).map((planQuery) => planQuery.refetch),
  };
}

function indexPlanCountries(countries: readonly Country[] | undefined, plans: readonly BandPlan[] | null): Map<number, string[]> | null {
  if (countries === undefined || plans === null) return null;

  const countryCodesByBand = new Map<number, string[]>();
  for (const [index, country] of countries.entries()) {
    const plan = plans[index];
    if (plan === undefined) return null;

    for (const bandId of plan) {
      const countryCodes = countryCodesByBand.get(bandId);
      if (countryCodes) countryCodes.push(country.code);
      else countryCodesByBand.set(bandId, [country.code]);
    }
  }
  return countryCodesByBand;
}

export function useBandListRows(criteria: BandListCriteria, searchText: string) {
  const bandsQuery = useQuery(bandsQueryOptions());
  const breakdownQuery = useQuery(stationBreakdownQueryOptions("band"));
  const countriesQuery = useQuery(countriesQueryOptions());
  const bandPlans = useQueries({
    queries: (countriesQuery.data ?? NO_COUNTRIES).map((country) => bandPlanQueryOptions(country.code)),
    combine: combinePlanQueries,
  });

  const bands = bandsQuery.data ?? NO_BANDS;
  const countryCodesByBand = indexPlanCountries(countriesQuery.data, bandPlans.plans);
  const cellsByBand = breakdownQuery.data === undefined ? null : sumCellsByBand(breakdownQuery.data);
  const havePlansFailed = countryCodesByBand === null && (countriesQuery.isError || bandPlans.hasFailed);
  const haveCellsFailed = cellsByBand === null && breakdownQuery.isError;

  function getPlanCountryCodes(bandId: number): Loadable<readonly string[]> {
    const countryCodes = countryCodesByBand === null ? undefined : (countryCodesByBand.get(bandId) ?? NO_COUNTRY_CODES);
    return toLoadable(countryCodes, havePlansFailed);
  }

  function getCellCount(bandId: number): Loadable<number> {
    const cellCount = cellsByBand === null ? undefined : (cellsByBand.get(bandId) ?? 0);
    return toLoadable(cellCount, haveCellsFailed);
  }

  const rows = filterBands(bands, searchText, criteria).map((band): BandListRow => ({
    band,
    planCountryCodes: getPlanCountryCodes(band.id),
    cellCount: getCellCount(band.id),
  }));

  function retryDetails() {
    if (breakdownQuery.isError) void breakdownQuery.refetch();
    if (countriesQuery.isError) void countriesQuery.refetch();
    for (const refetchPlan of bandPlans.failedRefetches) void refetchPlan();
  }

  return {
    rows,
    bands,
    cellsByBand,
    isLoading: bandsQuery.isPending,
    isFetching: bandsQuery.isFetching,
    isError: bandsQuery.isError,
    refetch: bandsQuery.refetch,
    haveDetailsFailed: havePlansFailed || haveCellsFailed,
    isRetryingDetails: breakdownQuery.isFetching || countriesQuery.isFetching || bandPlans.isFetching,
    retryDetails,
  };
}
