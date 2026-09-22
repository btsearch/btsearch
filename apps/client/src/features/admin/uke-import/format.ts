import type { ImportStep } from "./api";
import { formatDuration } from "@/lib/format";

export function formatImportStepDuration(step: ImportStep, now: number): string | null {
  if (!step.startedAt || (!step.finishedAt && step.status !== "running")) return null;

  const start = Date.parse(step.startedAt);
  const end = step.finishedAt ? Date.parse(step.finishedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (step.finishedAt && end < start) return null;

  const elapsed = Math.max(0, end - start);
  return `${formatDuration(elapsed)} ${String(elapsed % 1000).padStart(3, "0")}ms`;
}
