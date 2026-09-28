import { z } from "zod/v4";

export const IMPORT_STEP_KEYS = [
  "permits",
  "radiolines",
  "device_registry",
  "prune_deleted_entries",
  "prune_associations",
  "cleanup_orphaned_uke_entities",
  "associate",
  "snapshot",
  "refresh_statistics",
  "cleanup",
] as const;

const importStepSchema = z.object({
  key: z.enum(IMPORT_STEP_KEYS),
  status: z.enum(["pending", "running", "success", "skipped", "error"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
  warning: z.string().optional(),
});

export const importJobStatusSchema = z.object({
  id: z.string().optional(),
  trigger: z.enum(["manual", "scheduled"]).optional(),
  state: z.enum(["idle", "running", "success", "error"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  steps: z.array(importStepSchema),
  error: z.string().optional(),
});

export type ImportStepKey = (typeof IMPORT_STEP_KEYS)[number];
export type ImportStep = z.infer<typeof importStepSchema>;
export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;
export type ImportTrigger = NonNullable<ImportJobStatus["trigger"]>;
