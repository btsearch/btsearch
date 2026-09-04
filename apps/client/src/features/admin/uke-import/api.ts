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

export interface StartImportPayload {
  importPermits?: boolean;
  importRadiolines?: boolean;
  importDeviceRegistry?: boolean;
}

export async function fetchImportStatus(): Promise<ImportJobStatus> {
  const res = await fetchJson<{ data: ImportJobStatus }>(`${API_BASE}/uke/import/status`);
  return res.data;
}

export async function startImport(payload: StartImportPayload): Promise<ImportJobStatus> {
  const res = await fetchJson<{ data: ImportJobStatus }>(`${API_BASE}/uke/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.data;
}
