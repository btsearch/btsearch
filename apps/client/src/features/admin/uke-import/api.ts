import { queryOptions } from "@tanstack/react-query";

import { API_BASE, fetchJson } from "@/lib/api";

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
}

export interface ImportJobStatus {
  state: JobState;
  startedAt?: string;
  finishedAt?: string;
  steps: ImportStep[];
  error?: string;
}

export const UKE_IMPORT_STATUS_QUERY_KEY = ["uke-import-status"] as const;

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

export const importStatusQueryOptions = queryOptions({
  queryKey: UKE_IMPORT_STATUS_QUERY_KEY,
  queryFn: fetchImportStatus,
  refetchInterval: (query) => (isImportStatusInProgress(query.state.data) ? 2000 : false),
});

export async function startImport(payload: StartImportPayload): Promise<ImportJobStatus> {
  const res = await fetchJson<{ data: ImportJobStatus }>(`${API_BASE}/uke/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.data;
}
