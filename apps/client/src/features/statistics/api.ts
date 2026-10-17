import type {
  AnalyzerUsagePoint,
  CountryCompleteness,
  PermitBreakdownRow,
  PermitHistoryDimension,
  PermitHistoryPoint,
  PermitStatisticsDimension,
  StationBreakdownRow,
  StatisticsDimension,
  StatisticsHistoryPoint,
  StatisticsInterval,
} from "@openbts/shared/contract";

import { appendList, fetchV2Data } from "@/lib/api";

type PermitHistoryParams = {
  groupBy: readonly PermitHistoryDimension[];
  interval: StatisticsInterval;
  takenAfter?: string;
  takenBefore?: string;
};

function withParams(path: string, params: URLSearchParams): string {
  const search = params.toString();
  return search === "" ? path : `${path}?${search}`;
}

function withGroupBy(path: string, groupBy: readonly string[]): string {
  const params = new URLSearchParams();
  appendList(params, "groupBy", groupBy);
  return withParams(path, params);
}

export function fetchStationBreakdown(groupBy: readonly StatisticsDimension[], signal?: AbortSignal): Promise<StationBreakdownRow[]> {
  return fetchV2Data<StationBreakdownRow[]>(withGroupBy("statistics/stations", groupBy), { signal });
}

export function fetchPermitBreakdown(groupBy: readonly PermitStatisticsDimension[], signal?: AbortSignal): Promise<PermitBreakdownRow[]> {
  return fetchV2Data<PermitBreakdownRow[]>(withGroupBy("statistics/permits", groupBy), { signal });
}

export function fetchPermitHistory(
  { groupBy, interval, takenAfter, takenBefore }: PermitHistoryParams,
  signal?: AbortSignal,
): Promise<PermitHistoryPoint[]> {
  const params = new URLSearchParams({ interval });
  appendList(params, "groupBy", groupBy);
  if (takenAfter !== undefined) params.set("takenAfter", takenAfter);
  if (takenBefore !== undefined) params.set("takenBefore", takenBefore);
  return fetchV2Data<PermitHistoryPoint[]>(withParams("statistics/permits/history", params), { signal });
}

export function fetchCompleteness(signal?: AbortSignal): Promise<CountryCompleteness[]> {
  return fetchV2Data<CountryCompleteness[]>("statistics/completeness", { signal });
}

export function fetchStatisticsHistory(interval: StatisticsInterval, signal?: AbortSignal): Promise<StatisticsHistoryPoint[]> {
  return fetchV2Data<StatisticsHistoryPoint[]>(`statistics/history?interval=${interval}`, { signal });
}

export function fetchAnalyzerUsage(interval: StatisticsInterval, signal?: AbortSignal): Promise<AnalyzerUsagePoint[]> {
  return fetchV2Data<AnalyzerUsagePoint[]>(`statistics/analyzer-usage?interval=${interval}`, { signal });
}
