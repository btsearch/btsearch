import type { RunStepRow } from "./runs";
import { formatDuration } from "@/lib/format";

export type TimedStep = Pick<RunStepRow, "status" | "startedAt" | "finishedAt">;

export function formatImportStepDuration(step: TimedStep, now: number): string | null {
  if (step.startedAt === null || (step.finishedAt === null && step.status !== "running")) return null;

  const start = Date.parse(step.startedAt);
  const end = step.finishedAt === null ? now : Date.parse(step.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (step.finishedAt !== null && end < start) return null;

  const elapsed = Math.max(0, end - start);
  return step.finishedAt !== null && elapsed < 1000 ? `${elapsed} ms` : formatDuration(elapsed);
}
