import type { ImportRun, ImportRunCreate, ImportRunDetail, ImportRunList } from "@openbts/shared/contract";
import { infiniteQueryOptions, queryOptions, useQuery } from "@tanstack/react-query";

import { type ImportOverview, hasAppliedRunEnded, hasRunListChanged, isImportInProgress, isRunLive, isSourceImporting } from "./runs";
import { referenceKeys } from "@/features/admin/reference/api/queryKeys";
import { postData } from "@/features/admin/reference/api/request";
import { countryStatisticsQueryOptions } from "@/features/map/statsApi";
import { officialKeys } from "@/features/official/queries";
import { API_V2_BASE, fetchJson, fetchV2Data, isConflict } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const IMPORT_ROOT = ["admin", "official-import"] as const;
const RUN_DETAILS_KEY = [...IMPORT_ROOT, "run"] as const;
const RUNS_PATH = "official/import-runs";
const HISTORY_PAGE_SIZE = 24;
const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 60_000;
const OVERVIEW_RUN_COUNT = 20;

export const importKeys = {
  overview: () => [...IMPORT_ROOT, "overview"] as const,
  history: () => [...IMPORT_ROOT, "history"] as const,
  run: (id: string) => [...RUN_DETAILS_KEY, id] as const,
};

function fetchImportRunPage(limit: number, cursor: string | null, signal?: AbortSignal): Promise<ImportRunList> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) query.set("cursor", cursor);
  return fetchJson<ImportRunList>(`${API_V2_BASE}/${RUNS_PATH}?${query.toString()}`, { signal });
}

function fetchImportRun(id: string, signal?: AbortSignal): Promise<ImportRunDetail> {
  return fetchV2Data<ImportRunDetail>(`${RUNS_PATH}/${id}`, { signal });
}

async function fetchImportOverview(previous: ImportOverview | undefined, signal?: AbortSignal): Promise<ImportOverview> {
  const { data: runs } = await fetchImportRunPage(OVERVIEW_RUN_COUNT, null, signal);
  const liveRuns = runs.filter(isRunLive);
  const newestRun = runs.at(0);
  if (newestRun === undefined) return { latest: null, liveRuns };

  const known = previous?.latest ?? null;
  if (known !== null && known.id === newestRun.id && known.status === newestRun.status && !isRunLive(newestRun)) return { latest: known, liveRuns };
  return { latest: await fetchImportRun(newestRun.id, signal), liveRuns };
}

function invalidateImportedData(): void {
  void queryClient.invalidateQueries({ queryKey: officialKeys.all });
  void queryClient.invalidateQueries({ queryKey: countryStatisticsQueryOptions().queryKey });
  void queryClient.invalidateQueries({ queryKey: referenceKeys.countryStatistics() });
}

async function fetchImportOverviewAndRefreshDerivedQueries(signal?: AbortSignal): Promise<ImportOverview> {
  const previous = queryClient.getQueryData<ImportOverview>(importKeys.overview());
  const overview = await fetchImportOverview(previous, signal);
  if (hasRunListChanged(previous, overview)) {
    void queryClient.invalidateQueries({ queryKey: importKeys.history() });
    void queryClient.invalidateQueries({ queryKey: RUN_DETAILS_KEY });
  }
  if (hasAppliedRunEnded(previous, overview)) invalidateImportedData();
  return overview;
}

export const importOverviewQueryOptions = queryOptions({
  queryKey: importKeys.overview(),
  queryFn: ({ signal }) => fetchImportOverviewAndRefreshDerivedQueries(signal),
  refetchInterval: (query) => (isImportInProgress(query.state.data) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
});

export const importHistoryQueryOptions = infiniteQueryOptions({
  queryKey: importKeys.history(),
  queryFn: ({ pageParam, signal }) => fetchImportRunPage(HISTORY_PAGE_SIZE, pageParam, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
});

export function useIsSourceImporting(sourceKey: string): boolean {
  const { data = false } = useQuery({
    ...importOverviewQueryOptions,
    select: (overview) => isSourceImporting(overview, sourceKey),
    refetchOnMount: false,
  });
  return data;
}

export function importRunQueryOptions(id: string) {
  return queryOptions({
    queryKey: importKeys.run(id),
    queryFn: ({ signal }) => fetchImportRun(id, signal),
    refetchInterval: (query) => (isRunLive(query.state.data) ? ACTIVE_POLL_MS : false),
  });
}

async function nullOnConflict(request: Promise<ImportRun>): Promise<ImportRun | null> {
  try {
    return await request;
  } catch (error) {
    if (isConflict(error)) return null;
    throw error;
  }
}

export function startImportRun(body: ImportRunCreate): Promise<ImportRun | null> {
  return nullOnConflict(postData<ImportRun>(RUNS_PATH, body));
}

export function cancelImportRun(id: string): Promise<ImportRun | null> {
  return nullOnConflict(fetchV2Data<ImportRun>(`${RUNS_PATH}/${id}/cancel`, { method: "POST" }));
}
