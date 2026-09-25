import { errorMessage } from "../utils/errorMessage.js";

export const SOURCE_IMPORT_STEP_KEYS = ["permits", "radiolines", "device_registry"] as const;
export type SourceImportStepKey = (typeof SOURCE_IMPORT_STEP_KEYS)[number];
export type ImportWorkerTask = "importPermits" | "importRadiolines" | "importDeviceRegistry";
export type SourceImportStepStatus = "running" | "success" | "skipped" | "error";

export interface SourceImportTaskResult {
  changed: boolean;
  warnings: string[];
}

interface SourceImportStepDetails {
  error?: string;
  warning?: string;
}

interface SourceImportStepDependencies {
  runTask: (task: ImportWorkerTask) => Promise<SourceImportTaskResult>;
  persistStatus: (step: SourceImportStepKey, status: SourceImportStepStatus, details?: SourceImportStepDetails) => Promise<void>;
}

export async function runSourceImportStep(
  step: SourceImportStepKey,
  task: ImportWorkerTask,
  enabled: boolean,
  dependencies: SourceImportStepDependencies,
): Promise<boolean> {
  if (!enabled) {
    await dependencies.persistStatus(step, "skipped");
    return false;
  }

  await dependencies.persistStatus(step, "running");

  try {
    const { changed, warnings } = await dependencies.runTask(task);
    await dependencies.persistStatus(step, changed ? "success" : "skipped", { warning: warnings.join("\n") || undefined });
    return changed;
  } catch (error) {
    await dependencies.persistStatus(step, "error", { error: errorMessage(error) });
    return false;
  }
}
