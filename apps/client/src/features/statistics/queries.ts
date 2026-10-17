import type { OfficialBandLabel, StatisticsInterval } from "@openbts/shared/contract";
import { queryOptions, useQuery } from "@tanstack/react-query";

import {
  fetchAnalyzerUsage,
  fetchCompleteness,
  fetchPermitBreakdown,
  fetchPermitHistory,
  fetchStationBreakdown,
  fetchStatisticsHistory,
} from "./api";
import {
  type DatabaseSummary,
  type RegisterSummary,
  buildPermitSnapshot,
  groupHistoryByLabel,
  listBandValues,
  listLabelValues,
  listOperatorHistory,
  listRegionValues,
  sumCompleteness,
  sumContributions,
  summarizePermits,
  summarizeStations,
  toSnapshotRange,
  toUsagePoints,
} from "./lib/chartData";
import { type OperatorLookup, type OperatorValue, toStatisticsOperators } from "./lib/series";
import { officialBandLabelsQueryOptions, officialSourcesQueryOptions } from "@/features/official/queries";
import { findSiteSourceName } from "@/features/official/sources";
import { bandsQueryOptions, brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { queryClient } from "@/lib/queryClient";

export type Granularity = "daily" | "monthly";
type RegisterAndDatabase<Register, Database = Register> = { register: Register; database: Database };

const STATISTICS_ROOT = "stats";
const STATS_STALE_TIME = 1000 * 60 * 5;
const STATS_FRESHNESS_REFETCH_INTERVAL = 1000 * 60 * 5;
const INTERVALS: Record<Granularity, StatisticsInterval> = { daily: "day", monthly: "month" };

async function loadOperators(): Promise<OperatorLookup> {
  const [operators, brands] = await Promise.all([
    queryClient.ensureQueryData(operatorsQueryOptions()),
    queryClient.ensureQueryData(brandsQueryOptions()),
  ]);
  return toStatisticsOperators(operators, brands);
}

function loadBandLabels(): Promise<OfficialBandLabel[]> {
  return queryClient.ensureQueryData(officialBandLabelsQueryOptions());
}

async function loadSummary(signal: AbortSignal): Promise<RegisterAndDatabase<RegisterSummary, DatabaseSummary>> {
  const [permitTotals, permitsByRat, permitsByOperator, stationTotals, stationsByRat, stationsByOperator, operators, bandLabels] = await Promise.all([
    fetchPermitBreakdown([], signal),
    fetchPermitBreakdown(["rat"], signal),
    fetchPermitBreakdown(["operator"], signal),
    fetchStationBreakdown([], signal),
    fetchStationBreakdown(["rat"], signal),
    fetchStationBreakdown(["operator"], signal),
    loadOperators(),
    loadBandLabels(),
  ]);

  return {
    register: summarizePermits({ totals: permitTotals, byRat: permitsByRat, byOperator: permitsByOperator }, operators, bandLabels),
    database: summarizeStations({ totals: stationTotals, byRat: stationsByRat, byOperator: stationsByOperator }, operators),
  };
}

async function loadBandValues(signal: AbortSignal): Promise<RegisterAndDatabase<OperatorValue[]>> {
  const [permitRows, stationRows, operators, bandLabels, bands] = await Promise.all([
    fetchPermitBreakdown(["operator", "label"], signal),
    fetchStationBreakdown(["operator", "band"], signal),
    loadOperators(),
    loadBandLabels(),
    queryClient.ensureQueryData(bandsQueryOptions()),
  ]);

  return { register: listLabelValues(permitRows, operators, bandLabels), database: listBandValues(stationRows, operators, bands) };
}

async function loadRegionValues(signal: AbortSignal): Promise<RegisterAndDatabase<OperatorValue[]>> {
  const [permitRows, stationRows, operators, regions] = await Promise.all([
    fetchPermitBreakdown(["region", "operator"], signal),
    fetchStationBreakdown(["region", "operator"], signal),
    loadOperators(),
    queryClient.ensureQueryData(regionsQueryOptions()),
  ]);

  return {
    register: listRegionValues(permitRows, (row) => row.sites, operators, regions),
    database: listRegionValues(stationRows, (row) => row.stations, operators, regions),
  };
}

export function statisticsSummaryQueryOptions() {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "summary"] as const,
    queryFn: ({ signal }) => loadSummary(signal),
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function statisticsByBandQueryOptions() {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "bands"] as const,
    queryFn: ({ signal }) => loadBandValues(signal),
    staleTime: STATS_STALE_TIME,
    refetchInterval: STATS_FRESHNESS_REFETCH_INTERVAL,
  });
}

export function statisticsByRegionQueryOptions() {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "regions"] as const,
    queryFn: ({ signal }) => loadRegionValues(signal),
    staleTime: STATS_STALE_TIME,
  });
}

export function permitHistoryByBandQueryOptions(granularity: Granularity) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "permit-history", "bands", granularity] as const,
    queryFn: async ({ signal }) => {
      const [points, operators, bandLabels] = await Promise.all([
        fetchPermitHistory({ groupBy: ["operator", "label"], interval: INTERVALS[granularity] }, signal),
        loadOperators(),
        loadBandLabels(),
      ]);
      return groupHistoryByLabel(points, operators, bandLabels);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function permitHistoryByOperatorQueryOptions(granularity: Granularity) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "permit-history", "operators", granularity] as const,
    queryFn: async ({ signal }) => {
      const [points, operators] = await Promise.all([
        fetchPermitHistory({ groupBy: ["operator"], interval: INTERVALS[granularity] }, signal),
        loadOperators(),
      ]);
      return listOperatorHistory(points, operators);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function permitSnapshotQueryOptions(month: string) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "permit-snapshot", month] as const,
    queryFn: async ({ signal }) => {
      const [points, operators, bandLabels] = await Promise.all([
        fetchPermitHistory({ groupBy: ["operator", "label"], interval: "month", ...toSnapshotRange(month) }, signal),
        loadOperators(),
        loadBandLabels(),
      ]);
      return buildPermitSnapshot(points, month, operators, bandLabels);
    },
    staleTime: STATS_STALE_TIME,
  });
}

export function completenessQueryOptions() {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "completeness"] as const,
    queryFn: async ({ signal }) => sumCompleteness(await fetchCompleteness(signal)),
    staleTime: STATS_STALE_TIME,
  });
}

export function contributionsQueryOptions(granularity: Granularity) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "contributions", granularity] as const,
    queryFn: async ({ signal }) => sumContributions(await fetchStatisticsHistory(INTERVALS[granularity], signal), INTERVALS[granularity]),
    staleTime: STATS_STALE_TIME,
  });
}

export function analyzerUsageQueryOptions(granularity: Granularity) {
  return queryOptions({
    queryKey: [STATISTICS_ROOT, "analyzer-usage", granularity] as const,
    queryFn: async ({ signal }) => toUsagePoints(await fetchAnalyzerUsage(INTERVALS[granularity], signal), INTERVALS[granularity]),
    staleTime: STATS_STALE_TIME,
  });
}

export function useRegisterSourceName(): string | null {
  const { data = null } = useQuery({ ...officialSourcesQueryOptions(), select: findSiteSourceName });
  return data;
}
