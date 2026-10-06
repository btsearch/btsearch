import { queryOptions } from "@tanstack/react-query";

import { referenceKeys } from "@/features/admin/reference/api/queryKeys";
import { countryStatisticsQueryOptions } from "@/features/map/statsApi";
import { API_BASE, fetchJson } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export type ImportStepKey =
  | "permits"
  | "radiolines"
  | "device_registry"
  | "prune_deleted_entries"
  | "prune_associations"
  | "cleanup_orphaned_uke_entities"
  | "associate"
  | "snapshot"
  | "refresh_statistics"
  | "cleanup";
export type StepStatus = "pending" | "running" | "success" | "skipped" | "error";
export type JobState = "idle" | "running" | "success" | "error";

export interface ImportStep {
  key: ImportStepKey;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  warning?: string;
}

export interface ImportJobStatus {
  id?: string;
  trigger?: "manual" | "scheduled";
  state: JobState;
  startedAt?: string;
  finishedAt?: string;
  steps: ImportStep[];
  error?: string;
}

export const UKE_IMPORT_STATUS_QUERY_KEY = ["uke-import-status"] as const;
export const UKE_IMPORT_HISTORY_QUERY_KEY = ["uke-import-history"] as const;

const SOURCE_IMPORT_STEP_KEYS = new Set<ImportStepKey>(["permits", "radiolines", "device_registry"]);

export function getFailedImportSourceSteps(status: ImportJobStatus | undefined): ImportStep[] {
  if (!status) return [];
  return status.steps.filter((step) => step.status === "error" && SOURCE_IMPORT_STEP_KEYS.has(step.key));
}

export function isImportStatusInProgress(status: ImportJobStatus | undefined): boolean {
  if (!status) return false;
  if (status.state === "running") return true;
  if (status.state !== "success" && status.state !== "error") return false;

  const cleanup = status.steps.find((step) => step.key === "cleanup");
  return cleanup?.status === "pending" || cleanup?.status === "running";
}

export interface StartImportPayload {
  importPermits?: boolean;
  importRadiolines?: boolean;
  importDeviceRegistry?: boolean;
}

export async function fetchImportStatus(): Promise<ImportJobStatus> {
  const res = await fetchJson<{ data: ImportJobStatus }>(`${API_BASE}/uke/import/status`);
  return res.data;
}

function hasImportJobEndedSince(previous: ImportJobStatus | undefined, status: ImportJobStatus): boolean {
  if (previous === undefined || status.state === "running") return false;
  if (previous.state === "running") return true;
  return status.state !== "idle" && previous.id !== status.id;
}

function invalidateStatisticsQueries(): void {
  void queryClient.invalidateQueries({ queryKey: countryStatisticsQueryOptions().queryKey });
  void queryClient.invalidateQueries({ queryKey: referenceKeys.countryStatistics() });
}

async function fetchImportStatusAndRefreshDerivedQueries(): Promise<ImportJobStatus> {
  const previous = queryClient.getQueryData<ImportJobStatus>(UKE_IMPORT_STATUS_QUERY_KEY);
  const status = await fetchImportStatus();
  if (previous?.id !== undefined && previous.id !== status.id) void queryClient.invalidateQueries({ queryKey: UKE_IMPORT_HISTORY_QUERY_KEY });
  if (hasImportJobEndedSince(previous, status)) invalidateStatisticsQueries();
  return status;
}

export const importStatusQueryOptions = queryOptions({
  queryKey: UKE_IMPORT_STATUS_QUERY_KEY,
  queryFn: fetchImportStatusAndRefreshDerivedQueries,
  refetchInterval: (query) => (isImportStatusInProgress(query.state.data) ? 2000 : 60_000),
});

export async function fetchImportHistory(): Promise<ImportJobStatus[]> {
  const res = await fetchJson<{ data: ImportJobStatus[] }>(`${API_BASE}/uke/import/history`);
  return res.data;
}

export const importHistoryQueryOptions = queryOptions({
  queryKey: UKE_IMPORT_HISTORY_QUERY_KEY,
  queryFn: fetchImportHistory,
});

export async function startImport(payload: StartImportPayload): Promise<ImportJobStatus> {
  const res = await fetchJson<{ data: ImportJobStatus }>(`${API_BASE}/uke/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.data;
}
