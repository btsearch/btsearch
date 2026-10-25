import type { EngineRun } from "@openbts/shared/contract";
import type { TFunction } from "i18next";

export type EngineRunState = "queued" | "running" | "done" | "failed" | "cancelled";

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;

export function getEngineRunState(run: Pick<EngineRun, "outcome" | "startedAt">): EngineRunState {
  if (run.outcome !== null) return run.outcome;
  return run.startedAt === null ? "queued" : "running";
}

export function formatElapsed(t: TFunction, milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(milliseconds, 0) / MINUTE_MS);
  if (totalMinutes < 1) return t("measurements.engine.duration.underMinute");
  if (totalMinutes < HOUR_MINUTES) return t("measurements.engine.duration.minutes", { minutes: totalMinutes });

  const hours = Math.floor(totalMinutes / HOUR_MINUTES);
  const minutes = totalMinutes % HOUR_MINUTES;
  if (minutes === 0) return t("measurements.engine.duration.hours", { hours });
  return t("measurements.engine.duration.hoursMinutes", { hours, minutes });
}

export function getRunDurationMs(run: Pick<EngineRun, "startedAt" | "finishedAt">, now: number): number | null {
  if (run.startedAt === null) return null;
  const end = run.finishedAt === null ? now : Date.parse(run.finishedAt);
  return end - Date.parse(run.startedAt);
}
