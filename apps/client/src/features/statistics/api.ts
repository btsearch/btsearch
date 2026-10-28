import type {
  AnalyzerUsagePoint,
  ContributorLeaderboard,
  CountryCompleteness,
  ObservationStatistics,
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

type LeaderboardParams = { startsOn: string | null; limit: number };

function countryParams(countryCode: string, groupBy: readonly string[] = []): URLSearchParams {
  const params = new URLSearchParams({ countryCodes: countryCode });
  appendList(params, "groupBy", groupBy);
  return params;
}

export function fetchStationBreakdown(
  countryCode: string,
  groupBy: readonly StatisticsDimension[],
  signal?: AbortSignal,
): Promise<StationBreakdownRow[]> {
  return fetchV2Data<StationBreakdownRow[]>(`statistics/stations?${countryParams(countryCode, groupBy).toString()}`, { signal });
}

export function fetchPermitBreakdown(
  countryCode: string,
  groupBy: readonly PermitStatisticsDimension[],
  signal?: AbortSignal,
): Promise<PermitBreakdownRow[]> {
  return fetchV2Data<PermitBreakdownRow[]>(`statistics/permits?${countryParams(countryCode, groupBy).toString()}`, { signal });
}

export function fetchPermitHistory(
  countryCode: string,
  { groupBy, interval, takenAfter, takenBefore }: PermitHistoryParams,
  signal?: AbortSignal,
): Promise<PermitHistoryPoint[]> {
  const params = countryParams(countryCode, groupBy);
  params.set("interval", interval);
  if (takenAfter !== undefined) params.set("takenAfter", takenAfter);
  if (takenBefore !== undefined) params.set("takenBefore", takenBefore);
  return fetchV2Data<PermitHistoryPoint[]>(`statistics/permits/history?${params.toString()}`, { signal });
}

export function fetchCompleteness(countryCode: string, signal?: AbortSignal): Promise<CountryCompleteness[]> {
  return fetchV2Data<CountryCompleteness[]>(`statistics/completeness?${countryParams(countryCode).toString()}`, { signal });
}

export function fetchStatisticsHistory(
  countryCode: string,
  interval: StatisticsInterval,
  takenAfter: string | undefined,
  signal?: AbortSignal,
): Promise<StatisticsHistoryPoint[]> {
  const params = countryParams(countryCode);
  params.set("interval", interval);
  if (takenAfter !== undefined) params.set("takenAfter", takenAfter);
  return fetchV2Data<StatisticsHistoryPoint[]>(`statistics/history?${params.toString()}`, { signal });
}

export function fetchAnalyzerUsage(interval: StatisticsInterval, usedAfter: string | undefined, signal?: AbortSignal): Promise<AnalyzerUsagePoint[]> {
  const params = new URLSearchParams({ interval });
  if (usedAfter !== undefined) params.set("usedAfter", usedAfter);
  return fetchV2Data<AnalyzerUsagePoint[]>(`statistics/analyzer-usage?${params.toString()}`, { signal });
}

export function fetchObservationStatistics(countryCode: string, signal?: AbortSignal): Promise<ObservationStatistics[]> {
  return fetchV2Data<ObservationStatistics[]>(`statistics/observations?${countryParams(countryCode).toString()}`, { signal });
}

export function fetchLeaderboards(
  countryCode: string,
  { startsOn, limit }: LeaderboardParams,
  signal?: AbortSignal,
): Promise<ContributorLeaderboard[]> {
  const params = countryParams(countryCode);
  if (startsOn !== null) params.set("startsOn", startsOn);
  params.set("limit", String(limit));
  return fetchV2Data<ContributorLeaderboard[]>(`statistics/leaderboards?${params.toString()}`, { signal });
}
