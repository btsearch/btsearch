import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";

export interface StatsResponse<T> {
  data: T;
  lastUpdated: string;
}

const fetchStatsResponse = <T>(endpoint: string) => fetchJson<StatsResponse<T>>(`${API_BASE}/${endpoint}`);

export interface StatsOperator {
  id: number;
  name: string;
  mnc: number | null;
}

export interface InternalSummary {
  total_stations: number;
  total_cells: number;
  by_rat: { rat: string; stations: number; cells: number; share_pct: number }[];
  by_operator: { operator: StatsOperator; stations: number; cells: number }[];
}

export interface StatsSummary {
  total_permits: number;
  total_unique_stations: number;
  by_rat: { rat: string; unique_stations: number; permits: number; share_pct: number }[];
  by_operator: { operator: StatsOperator; unique_stations: number; permits: number }[];
  internal: InternalSummary;
}

export interface StatsPermitRow {
  operator: StatsOperator;
  band: { id: number; name: string; rat: string };
  unique_stations: number;
  permits_count: number;
  share_pct: number;
}

export interface InternalPermitRow {
  operator: StatsOperator;
  band: { id: number; name: string; rat: string };
  stations: number;
  cells: number;
  share_pct: number;
}

export interface StatsPermitsResponse {
  uke: StatsPermitRow[];
  internal: InternalPermitRow[];
}

export interface VoivodeshipUkeRow {
  region: { id: number; name: string };
  operator: StatsOperator;
  unique_stations: number;
  permits: number;
}

export interface VoivodeshipInternalRow {
  region: { id: number; name: string };
  operator: StatsOperator;
  stations: number;
  cells: number;
}

export interface StatsVoivodeshipsResponse {
  uke: VoivodeshipUkeRow[];
  internal: VoivodeshipInternalRow[];
}

export interface StatsHistoryRow {
  date: string;
  operator: StatsOperator;
  band: { id: number; name: string };
  unique_stations: number;
  permits_count: number;
}

export interface StatsStationsHistoryRow {
  date: string;
  operator: StatsOperator;
  unique_stations: number;
}

export interface CompletenessStats {
  stations: {
    total: number;
    withSectors: number;
    withExtraIds: number;
  };
  cells: {
    lte: {
      documented: number;
      missing: number;
    };
    nr: {
      documented: number;
      missing: number;
    };
  };
}

export interface AnalyzerUsageRow {
  date: string;
  count: number;
}

export interface ContributionsHistoryRow {
  date: string;
  totalSectors: number;
  totalExtraIds: number;
  totalCellsWithPCI: number;
  addedSectors: number;
  addedExtraIds: number;
  addedCellsWithPCI: number;
}

export interface PermitSnapshot {
  snapshot_date: string | null;
  previous_snapshot_date: string | null;
  rows: {
    operator: StatsOperator;
    band: { id: number; name: string; rat: string };
    unique_stations: number;
    permits: number;
    unique_stations_delta: number;
    permits_delta: number;
  }[];
}

export const fetchStatsSummary = (operatorId?: number) =>
  fetchStatsResponse<StatsSummary>(`stats/summary${operatorId !== undefined ? `?operator_id=${operatorId}` : ""}`);

export const fetchStatsPermits = (operatorId?: number) =>
  fetchStatsResponse<StatsPermitsResponse>(`stats/permits${operatorId !== undefined ? `?operator_id=${operatorId}` : ""}`);

export const fetchStatsCompleteness = () => fetchApiData<CompletenessStats>("stats/completeness");

export const fetchAnalyzerUsage = (params?: { from?: string; to?: string; granularity?: "daily" | "monthly" }) => {
  const analyzerUsageParams = buildHistoryParams({
    from: params?.from,
    to: params?.to,
    granularity: params?.granularity,
  });
  return fetchApiData<AnalyzerUsageRow[]>(`stats/analyzer/usage${analyzerUsageParams ? `?${analyzerUsageParams}` : ""}`);
};

export const fetchContributionsHistory = (params?: { from?: string; to?: string; granularity?: "daily" | "monthly" }) => {
  const historyParams = buildHistoryParams({
    from: params?.from,
    to: params?.to,
    granularity: params?.granularity,
  });
  return fetchApiData<ContributionsHistoryRow[]>(`stats/contributions/history${historyParams ? `?${historyParams}` : ""}`);
};

export const fetchPermitSnapshot = (month: string) => fetchApiData<PermitSnapshot>(`stats/permits/snapshot?month=${month}`);

function buildHistoryParams(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

export const fetchStatsHistory = (params?: { operator_id?: number; band_id?: number; from?: string; to?: string; granularity?: string }) => {
  const historyParams = buildHistoryParams({
    operator_id: params?.operator_id,
    band_id: params?.band_id,
    from: params?.from,
    to: params?.to,
    granularity: params?.granularity,
  });
  return fetchApiData<StatsHistoryRow[]>(`stats/permits/history${historyParams ? `?${historyParams}` : ""}`);
};

export const fetchStatsStationsHistory = (params?: { operator_id?: number; from?: string; to?: string; granularity?: string }) => {
  const historyParams = buildHistoryParams({
    operator_id: params?.operator_id,
    from: params?.from,
    to: params?.to,
    granularity: params?.granularity,
  });
  return fetchApiData<StatsStationsHistoryRow[]>(`stats/stations/history${historyParams ? `?${historyParams}` : ""}`);
};

export const fetchStatsVoivodeships = (operatorId?: number) =>
  fetchApiData<StatsVoivodeshipsResponse>(`stats/voivodeships${operatorId !== undefined ? `?operator_id=${operatorId}` : ""}`);
