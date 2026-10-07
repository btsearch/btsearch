import type { EmfReport } from "./types";

const DAY_LENGTH = "YYYY-MM-DD".length;

export function getEmfReportDate(report: EmfReport): string | null {
  return report.kind === "filing" ? report.publishedAt : report.measuredOn;
}

export function getEmfReportIssuer(report: EmfReport): string | null {
  return report.kind === "filing" ? report.filerName : report.laboratoryName;
}

export function toEmfReportDate(date: string): Date {
  return new Date(date.length === DAY_LENGTH ? `${date}T00:00:00` : date);
}

export function listAntennaTableReports(reports: readonly EmfReport[]): EmfReport[] {
  return reports
    .filter((report) => report.kind === "measurement" && report.hasAntennaTable && report.measuredOn !== null)
    .sort((left, right) => (right.measuredOn ?? "").localeCompare(left.measuredOn ?? ""));
}
