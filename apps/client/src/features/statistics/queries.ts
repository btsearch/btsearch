import { type QueryFilters, queryOptions, useIsFetching } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
  fetchAnalyzerUsage,
  fetchCompleteness,
  fetchLeaderboards,
  fetchObservationStatistics,
  fetchPermitBreakdown,
  fetchPermitHistory,
  fetchPhotoBreakdown,
  fetchStationBreakdown,
  fetchStatisticsHistory,
} from "./api";
import {
  buildPermitSnapshot,
  groupHistoryByLabel,
  listBandRows,
  listLabelRows,
  listOperatorHistory,
  listRegionRows,
  sumCompleteness,
  sumContributions,
  summarizePermits,
  summarizePhotos,
  summarizeStations,
  toUsagePoints,
} from "./lib/chartData";
import { type OperatorLookup, toStatisticsOperators } from "./lib/operators";
import { INTERVALS, type Period, findPeriodStart, toPeriodKey, toSnapshotRange } from "./lib/periods";
import { countryStatisticsQueryOptions } from "@/features/map/statsApi";
import { officialSourcesQueryOptions } from "@/features/official/queries";
import { bandsQueryOptions, brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { queryClient } from "@/lib/queryClient";

const STATISTICS_ROOT = "stats";
const WHOLE_HISTORY = "all";
const STATS_STALE_TIME = 1000 * 60 * 5;
const STATS_FRESHNESS_REFETCH_INTERVAL = 1000 * 60 * 5;
const LEADERBOARD_SIZE = 25;

export const STATISTICS_LEADERBOARDS_KEY = [STATISTICS_ROOT, "leaderboards"] as const;

const FAILED_REFETCH_FILTERS: QueryFilters = {
  queryKey: [STATISTICS_ROOT],
  type: "active",
  predicate: (query) => query.state.status === "error" && query.state.data !== undefined,
};

async function loadOperators(): Promise<OperatorLookup> {
  const [operators, brands] = await Promise.all([
    queryClient.ensureQueryData(operatorsQueryOptions()),
    queryClient.ensureQueryData(brandsQueryOptions()),
  ]);
  return toStatisticsOperators(operators, brands);
}

export function databaseSummaryQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "summary", "database", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [totals, byRat, byOperator, operators] = await Promise.all([
        fetchStationBreakdown(countryCode, [], signal),
        fetchStationBreakdown(countryCode, ["rat"], signal),
        fetchStationBreakdown(countryCode, ["operator"], signal),
        loadOperators(),
      ]);
      return summarizeStations({ totals, byRat, byOperator }, operators);
    },
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function registerSummaryQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "summary", "register", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [totals, byRat, byOperator, operators] = await Promise.all([
        fetchPermitBreakdown(countryCode, [], signal),
        fetchPermitBreakdown(countryCode, ["rat"], signal),
        fetchPermitBreakdown(countryCode, ["operator"], signal),
        loadOperators(),
      ]);
      return summarizePermits({ totals, byRat, byOperator }, operators);
    },
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function photoSummaryQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "summary", "photos", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [totals, byOperator, operators] = await Promise.all([
        fetchPhotoBreakdown(countryCode, [], signal),
        fetchPhotoBreakdown(countryCode, ["operator"], signal),
        loadOperators(),
      ]);
      return summarizePhotos({ totals, byOperator }, operators);
    },
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function photoRegionsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "regions", "photos", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [rows, operators, regions] = await Promise.all([
        fetchPhotoBreakdown(countryCode, ["region", "operator"], signal),
        loadOperators(),
        queryClient.ensureQueryData(regionsQueryOptions()),
      ]);
      return listRegionRows(rows, (row) => row.photos, operators, regions);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function databaseBandsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "bands", "database", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [rows, operators, bands] = await Promise.all([
        fetchStationBreakdown(countryCode, ["operator", "band"], signal),
        loadOperators(),
        queryClient.ensureQueryData(bandsQueryOptions()),
      ]);
      return listBandRows(rows, operators, bands);
    },
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function registerBandsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "bands", "register", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [rows, operators] = await Promise.all([fetchPermitBreakdown(countryCode, ["operator", "label"], signal), loadOperators()]);
      return listLabelRows(rows, operators);
    },
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function databaseRegionsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "regions", "database", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [rows, operators, regions] = await Promise.all([
        fetchStationBreakdown(countryCode, ["region", "operator"], signal),
        loadOperators(),
        queryClient.ensureQueryData(regionsQueryOptions()),
      ]);
      return listRegionRows(rows, (row) => row.stations, operators, regions);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function registerRegionsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "regions", "register", countryCode] as const,
    queryFn: async ({ signal }) => {
      const [rows, operators, regions] = await Promise.all([
        fetchPermitBreakdown(countryCode, ["region", "operator"], signal),
        loadOperators(),
        queryClient.ensureQueryData(regionsQueryOptions()),
      ]);
      return listRegionRows(rows, (row) => row.sites, operators, regions);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function permitHistoryByBandQueryOptions(countryCode: string, period: Period) {
  const interval = INTERVALS[period.granularity];
  const takenAfter = findPeriodStart(period, new Date());
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "permit-history", "bands", countryCode, interval, takenAfter ?? WHOLE_HISTORY] as const,
    queryFn: async ({ signal }) => {
      const [points, operators] = await Promise.all([
        fetchPermitHistory(countryCode, { groupBy: ["operator", "label"], interval, takenAfter }, signal),
        loadOperators(),
      ]);
      return groupHistoryByLabel(points, operators);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function permitHistoryByOperatorQueryOptions(countryCode: string, period: Period) {
  const interval = INTERVALS[period.granularity];
  const takenAfter = findPeriodStart(period, new Date());
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "permit-history", "operators", countryCode, interval, takenAfter ?? WHOLE_HISTORY] as const,
    queryFn: async ({ signal }) => {
      const [points, operators] = await Promise.all([
        fetchPermitHistory(countryCode, { groupBy: ["operator"], interval, takenAfter }, signal),
        loadOperators(),
      ]);
      return listOperatorHistory(points, operators);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function permitSnapshotQueryOptions(countryCode: string, month: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "permit-snapshot", countryCode, month] as const,
    queryFn: async ({ signal }) => {
      const [points, operators] = await Promise.all([
        fetchPermitHistory(countryCode, { groupBy: ["operator", "label"], interval: "month", ...toSnapshotRange(month) }, signal),
        loadOperators(),
      ]);
      return buildPermitSnapshot(points, month, operators);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function completenessQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "completeness", countryCode] as const,
    queryFn: async ({ signal }) => sumCompleteness(await fetchCompleteness(countryCode, signal)),
    staleTime: STATS_STALE_TIME,
  });
}

export function contributionsQueryOptions(countryCode: string, period: Period) {
  const today = new Date();
  const interval = INTERVALS[period.granularity];
  const shownFrom = findPeriodStart(period, today);
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "contributions", countryCode, interval, shownFrom ?? WHOLE_HISTORY] as const,
    queryFn: async ({ signal }) => {
      const points = await fetchStatisticsHistory(countryCode, interval, findPeriodStart(period, today, 1), signal);
      const contributions = sumContributions(points, interval);
      if (shownFrom === undefined) return contributions;

      const firstShownPeriod = toPeriodKey(shownFrom, interval);
      return contributions.filter((point) => point.date >= firstShownPeriod);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function analyzerUsageQueryOptions(period: Period) {
  const interval = INTERVALS[period.granularity];
  const usedAfter = findPeriodStart(period, new Date());
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "analyzer-usage", interval, usedAfter ?? WHOLE_HISTORY] as const,
    queryFn: async ({ signal }) => toUsagePoints(await fetchAnalyzerUsage(interval, usedAfter, signal), interval),
    staleTime: STATS_STALE_TIME,
  });
}

export function observationStatisticsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "observations", countryCode] as const,
    queryFn: async ({ signal }) => {
      const entries = await fetchObservationStatistics(countryCode, signal);
      return entries.find((entry) => entry.countryCode === countryCode) ?? null;
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function leaderboardQueryOptions(countryCode: string, startsOn: string | null) {
  return queryOptions({
    queryKey: [...STATISTICS_LEADERBOARDS_KEY, countryCode, startsOn ?? WHOLE_HISTORY] as const,
    queryFn: async ({ signal }) => {
      const boards = await fetchLeaderboards(countryCode, { startsOn, limit: LEADERBOARD_SIZE }, signal);
      return boards.find((board) => board.countryCode === countryCode) ?? null;
    },
    staleTime: STATS_STALE_TIME,
  });
}

function subscribeToQueryCache(onChange: () => void): () => void {
  return queryClient.getQueryCache().subscribe(onChange);
}

function hasFailedRefetch(): boolean {
  return queryClient.getQueryCache().findAll(FAILED_REFETCH_FILTERS).length > 0;
}

export function useStatisticsRefetchError() {
  const hasRefetchError = useSyncExternalStore(subscribeToQueryCache, hasFailedRefetch);
  const isRetrying = useIsFetching(FAILED_REFETCH_FILTERS) > 0;
  return { hasRefetchError, isRetrying, retry: () => queryClient.refetchQueries(FAILED_REFETCH_FILTERS) };
}

async function prefetchRegisterStatistics(countryCode: string): Promise<void> {
  await queryClient.prefetchQuery(countriesQueryOptions());
  const country = queryClient.getQueryData(countriesQueryOptions().queryKey)?.find((entry) => entry.code === countryCode);
  if (country?.capabilities.official !== true) return;

  void queryClient.prefetchQuery(registerSummaryQueryOptions(countryCode));
  void queryClient.prefetchQuery(registerBandsQueryOptions(countryCode));
  void queryClient.prefetchQuery(registerRegionsQueryOptions(countryCode));
}

export function prefetchStatistics(requestedCountryCode: string | undefined): void {
  void queryClient.prefetchQuery(countryStatisticsQueryOptions());
  void queryClient.prefetchQuery(countriesQueryOptions());
  void queryClient.prefetchQuery(officialSourcesQueryOptions());
  void queryClient.prefetchQuery(operatorsQueryOptions());
  void queryClient.prefetchQuery(brandsQueryOptions());
  void queryClient.prefetchQuery(bandsQueryOptions());
  void queryClient.prefetchQuery(regionsQueryOptions());
  if (requestedCountryCode === undefined) return;

  void queryClient.prefetchQuery(databaseSummaryQueryOptions(requestedCountryCode));
  void queryClient.prefetchQuery(databaseBandsQueryOptions(requestedCountryCode));
  void queryClient.prefetchQuery(databaseRegionsQueryOptions(requestedCountryCode));
  void queryClient.prefetchQuery(completenessQueryOptions(requestedCountryCode));
  void queryClient.prefetchQuery(photoSummaryQueryOptions(requestedCountryCode));
  void prefetchRegisterStatistics(requestedCountryCode);
}
