export type SourceImportStepKey = "permits" | "radiolines" | "device_registry";
export type ImportWorkerTask = "importPermits" | "importRadiolines" | "importDeviceRegistry";
export type SourceImportStepStatus = "running" | "success" | "skipped" | "error";

interface SourceImportStepDependencies {
  runTask: (task: ImportWorkerTask) => Promise<boolean>;
  persistStatus: (step: SourceImportStepKey, status: SourceImportStepStatus) => Promise<void>;
  reportError: (step: SourceImportStepKey, message: string) => void;
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
    const changed = await dependencies.runTask(task);
    await dependencies.persistStatus(step, changed ? "success" : "skipped");
    return changed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dependencies.persistStatus(step, "error");
    dependencies.reportError(step, message);
    return false;
  }
}
