import redis from "../../../database/redis.js";
import type { DryRunReport } from "./report.js";

const REPORT_TTL_SECONDS = 7 * 24 * 60 * 60;

function reportKey(runId: string): string {
  return `official:import:dry-run:${runId}`;
}

export async function saveDryRunReport(runId: string, report: DryRunReport): Promise<void> {
  await redis.setEx(reportKey(runId), REPORT_TTL_SECONDS, JSON.stringify(report));
}

export async function loadDryRunReport(runId: string): Promise<DryRunReport | null> {
  const raw = await redis.get(reportKey(runId));
  return raw ? (JSON.parse(raw) as DryRunReport) : null;
}
