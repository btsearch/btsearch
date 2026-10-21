import type {
  ImportRun,
  ImportRunCreate,
  ImportRunDetail,
  ImportRunList,
  ImportRunStatus,
  OfficialDatasetUpdate,
  OfficialSourceUpdate,
} from "@openbts/shared/contract";
import { infiniteQueryOptions, queryOptions, useQuery } from "@tanstack/react-query";

import { type ImportOverview, hasAppliedRunEnded, hasRunListChanged, isImportInProgress, isRunLive, isSourceImporting } from "./runs";
import { referenceKeys } from "@/features/admin/reference/api/queryKeys";
import { patchData, postData } from "@/features/admin/reference/api/request";
import { countryStatisticsQueryOptions } from "@/features/map/statsApi";
import { officialKeys, officialSourcesQueryOptions } from "@/features/official/queries";
import { API_V2_BASE, fetchJson, fetchV2Data, isConflict } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const IMPORT_ROOT = ["admin", "official-import"] as const;
const RUN_DETAILS_KEY = [...IMPORT_ROOT, "run"] as const;
const RUNS_PATH = "official/import-runs";
const HISTORY_PAGE_SIZE = 24;
const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 60_000;
const LIVE_RUN_LIMIT = 20;
const LIVE_STATUSES: readonly ImportRunStatus[] = ["queued", "running"];
const HISTORY_KEY = [...IMPORT_ROOT, "history"] as const;

type RunPageQuery = { limit: number; cursor?: string | null; sourceKey?: string | null; statuses?: readonly ImportRunStatus[] };

export const importKeys = {
  overview: () => [...IMPORT_ROOT, "overview"] as const,
  history: (sourceKey: string | null) => [...HISTORY_KEY, sourceKey] as const,
  run: (id: string) => [...RUN_DETAILS_KEY, id] as const,
};

function fetchImportRunPage({ limit, cursor, sourceKey, statuses }: RunPageQuery, signal?: AbortSignal): Promise<ImportRunList> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  if (sourceKey) query.set("sourceKeys", sourceKey);
  if (statuses) query.set("statuses", statuses.join(","));
  return fetchJson<ImportRunList>(`${API_V2_BASE}/${RUNS_PATH}?${query.toString()}`, { signal });
}

function fetchImportRun(id: string, signal?: AbortSignal): Promise<ImportRunDetail> {
  return fetchV2Data<ImportRunDetail>(`${RUNS_PATH}/${id}`, { signal });
}

async function fetchNewestRun(sourceKey: string, signal?: AbortSignal): Promise<ImportRun | null> {
  const { data } = await fetchImportRunPage({ limit: 1, sourceKey }, signal);
  return data.at(0) ?? null;
}

function fetchRunDetailUnlessKnown(run: ImportRun, previous: ImportOverview | undefined, signal?: AbortSignal): Promise<ImportRunDetail> {
  const known = previous?.latestRuns.find((candidate) => candidate.id === run.id);
  const isUnchanged = known !== undefined && known.status === run.status && !isRunLive(run);
  return isUnchanged ? Promise.resolve(known) : fetchImportRun(run.id, signal);
}

async function fetchImportOverview(previous: ImportOverview | undefined, signal?: AbortSignal): Promise<ImportOverview> {
  const sources = await queryClient.ensureQueryData(officialSourcesQueryOptions());
  const [newestRuns, { data: liveRuns }] = await Promise.all([
    Promise.all(sources.map((source) => fetchNewestRun(source.key, signal))),
    fetchImportRunPage({ limit: LIVE_RUN_LIMIT, statuses: LIVE_STATUSES }, signal),
  ]);
  const latestRuns = await Promise.all(newestRuns.flatMap((run) => (run === null ? [] : [fetchRunDetailUnlessKnown(run, previous, signal)])));
  return { latestRuns, liveRuns };
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
    void queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
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

export function importHistoryQueryOptions(sourceKey: string | null) {
  return infiniteQueryOptions({
    queryKey: importKeys.history(sourceKey),
    queryFn: ({ pageParam, signal }) => fetchImportRunPage({ limit: HISTORY_PAGE_SIZE, cursor: pageParam, sourceKey }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
  });
}

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

export function updateOfficialSource(key: string, changes: OfficialSourceUpdate): Promise<unknown> {
  return patchData(`official/sources/${key}`, changes);
}

export function updateOfficialDataset(id: number, changes: OfficialDatasetUpdate): Promise<unknown> {
  return patchData(`official/datasets/${id}`, changes);
}

export function cancelImportRun(id: string): Promise<ImportRun | null> {
  return nullOnConflict(fetchV2Data<ImportRun>(`${RUNS_PATH}/${id}/cancel`, { method: "POST" }));
}
