import type {
  AnalyzerUsagePoint,
  Band,
  CellRat,
  CountryCompleteness,
  OfficialBandLabel,
  OfficialRat,
  PermitBreakdownRow,
  PermitHistoryPoint,
  Region,
  StationBreakdownRow,
  StatisticsHistoryPoint,
  StatisticsInterval,
} from "@openbts/shared/contract";
import { formatPermitLabel } from "@openbts/shared/permitLabel";

import { type OperatorLookup, type OperatorValue, type StatisticsOperator, compareOperators } from "./series";
import {
  type OfficialLabelParts,
  toOfficialLabelComparator,
  toOfficialLabelKey,
  toOfficialRatComparator,
  toOfficialRatOption,
} from "@/features/official/labels";

type PermitCounts = Pick<PermitBreakdownRow, "sites" | "permits">;
type StationCounts = Pick<StationBreakdownRow, "stations" | "cells">;
type WithOperator<T> = T & { operator: StatisticsOperator };
type DrawableRow<T, G> = { row: T; group: G; operator: StatisticsOperator };
type PciCoverage = { documented: number; missing: number };

type PermitBreakdowns = Record<"totals" | "byRat" | "byOperator", readonly PermitBreakdownRow[]>;
type StationBreakdowns = Record<"totals" | "byRat" | "byOperator", readonly StationBreakdownRow[]>;
export type RegisterRatShare = PermitCounts & { rat: OfficialRat; label: string; colorIndex: number; sharePct: number };
export type RegisterSummary = PermitCounts & { rats: RegisterRatShare[]; operators: WithOperator<PermitCounts>[] };
type DatabaseRatShare = StationCounts & { rat: CellRat; label: string; sharePct: number };
export type DatabaseSummary = StationCounts & { rats: DatabaseRatShare[]; operators: WithOperator<StationCounts>[] };
export type OperatorPoint = { date: string; operator: StatisticsOperator; value: number };
export type BandHistory = { key: string; name: string; points: OperatorPoint[] };
export type SnapshotRow = WithOperator<Pick<PermitHistoryPoint, "sites" | "permits" | "added">>;
export type SnapshotBand = { key: string; name: string; rows: SnapshotRow[] };
type PermitSnapshot = { snapshotOn: string | null; previousSnapshotOn: string | null; bands: SnapshotBand[] };
type CompletenessTotals = { stations: CountryCompleteness["stations"]; cells: Record<"lte" | "nr", PciCoverage> };
type ContributionPoint = { date: string; sectors: number; identifiers: number; cellsWithPci: number };
type UsagePoint = { date: string; count: number };

const DATABASE_RAT_ORDER: readonly CellRat[] = ["nr", "lte", "umts", "gsm"];
const MONTH_LENGTH = 7;
const DAY_LENGTH = 10;

function sum<T>(rows: readonly T[], read: (row: T) => number): number {
  return rows.reduce((total, row) => total + read(row), 0);
}

function sumPermitCounts(rows: readonly PermitCounts[]): PermitCounts {
  return { sites: sum(rows, (row) => row.sites), permits: sum(rows, (row) => row.permits) };
}

function sumStationCounts(rows: readonly StationCounts[]): StationCounts {
  return { stations: sum(rows, (row) => row.stations), cells: sum(rows, (row) => row.cells) };
}

function groupRows<T, K>(rows: readonly T[], keyOf: (row: T) => K | null): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;

    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return groups;
}

function toSharePct(part: number, total: number): number {
  return total > 0 ? (part * 100) / total : 0;
}

function listDrawableRows<T extends { operatorId: number | null }, G>(
  rows: readonly T[],
  operators: OperatorLookup,
  findGroup: (row: T) => G | null | undefined,
): DrawableRow<T, G>[] {
  return rows.flatMap((row) => {
    const group = findGroup(row);
    const operator = row.operatorId === null ? undefined : operators.get(row.operatorId);
    return group === null || group === undefined || operator === undefined ? [] : [{ row, group, operator }];
  });
}

function listOperatorCounts<T extends { operatorId: number | null }, C extends object>(
  rows: readonly T[],
  operators: OperatorLookup,
  sumCounts: (rows: readonly T[]) => C,
): WithOperator<C>[] {
  return [...groupRows(rows, (row) => row.operatorId)]
    .flatMap(([operatorId, group]) => {
      const operator = operators.get(operatorId);
      return operator === undefined ? [] : [{ ...sumCounts(group), operator }];
    })
    .sort((left, right) => compareOperators(left.operator, right.operator));
}

function toPeriod(day: string, interval: StatisticsInterval): string {
  return interval === "month" ? day.slice(0, MONTH_LENGTH) : day;
}

function findLatestDay(points: readonly Pick<PermitHistoryPoint, "snapshotOn">[]): string | null {
  let latest: string | null = null;
  for (const { snapshotOn } of points) {
    if (latest === null || snapshotOn > latest) latest = snapshotOn;
  }
  return latest;
}

export function toLabelName({ rat, labelMhz, variant }: OfficialLabelParts): string | null {
  if (rat === null || labelMhz === null) return null;
  return formatPermitLabel({ rat: rat.toUpperCase(), mhz: labelMhz, variant: variant ?? "commercial" });
}

export function summarizePermits(breakdowns: PermitBreakdowns, operators: OperatorLookup, bandLabels: readonly OfficialBandLabel[]): RegisterSummary {
  const total = sumPermitCounts(breakdowns.totals);
  const compareRats = toOfficialRatComparator(bandLabels);
  const ratGroups = groupRows(breakdowns.byRat, (row) => row.rat);
  const labelRats = bandLabels.flatMap((label) => (label.rat === null ? [] : [label.rat]));
  const paletteOrder = [...new Set([...labelRats, ...ratGroups.keys()])].sort(compareRats);

  const rats = [...ratGroups]
    .map(([rat, rows]): RegisterRatShare => {
      const counts = sumPermitCounts(rows);
      return {
        ...counts,
        rat,
        label: toOfficialRatOption(rat).label,
        colorIndex: paletteOrder.indexOf(rat),
        sharePct: toSharePct(counts.sites, total.sites),
      };
    })
    .sort((left, right) => compareRats(left.rat, right.rat));

  return { ...total, rats, operators: listOperatorCounts(breakdowns.byOperator, operators, sumPermitCounts) };
}

export function summarizeStations(breakdowns: StationBreakdowns, operators: OperatorLookup): DatabaseSummary {
  const total = sumStationCounts(breakdowns.totals);
  const rats = [...groupRows(breakdowns.byRat, (row) => row.rat)]
    .map(([rat, rows]): DatabaseRatShare => {
      const counts = sumStationCounts(rows);
      return { ...counts, rat, label: rat.toUpperCase(), sharePct: toSharePct(counts.stations, total.stations) };
    })
    .sort((left, right) => DATABASE_RAT_ORDER.indexOf(left.rat) - DATABASE_RAT_ORDER.indexOf(right.rat));

  return { ...total, rats, operators: listOperatorCounts(breakdowns.byOperator, operators, sumStationCounts) };
}

export function listLabelValues(
  rows: readonly PermitBreakdownRow[],
  operators: OperatorLookup,
  bandLabels: readonly OfficialBandLabel[],
): OperatorValue[] {
  const sortedRows = [...rows].sort(toOfficialLabelComparator(bandLabels));
  return listDrawableRows(sortedRows, operators, toLabelName).map(({ row, group, operator }) => ({ group, operator, value: row.sites }));
}

export function listBandValues(rows: readonly StationBreakdownRow[], operators: OperatorLookup, bands: readonly Band[]): OperatorValue[] {
  const bandsById = new Map(bands.map((band, position) => [band.id, { name: band.name, position }]));
  return listDrawableRows(rows, operators, (row) => (row.bandId === null ? undefined : bandsById.get(row.bandId)))
    .sort((left, right) => left.group.position - right.group.position)
    .map(({ row, group, operator }) => ({ group: group.name, operator, value: row.stations }));
}

export function listRegionValues<T extends { regionId: number | null; operatorId: number | null }>(
  rows: readonly T[],
  readValue: (row: T) => number,
  operators: OperatorLookup,
  regions: readonly Region[],
): OperatorValue[] {
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  return listDrawableRows(rows, operators, (row) => (row.regionId === null ? undefined : regionNames.get(row.regionId)))
    .map(({ row, group, operator }) => ({ group, operator, value: readValue(row) }))
    .sort((left, right) => left.group.localeCompare(right.group));
}

export function groupHistoryByLabel(
  points: readonly PermitHistoryPoint[],
  operators: OperatorLookup,
  bandLabels: readonly OfficialBandLabel[],
): BandHistory[] {
  const bands = new Map<string, BandHistory>();
  const sortedPoints = [...points].sort(toOfficialLabelComparator(bandLabels));
  for (const { row: point, group: name, operator } of listDrawableRows(sortedPoints, operators, toLabelName)) {
    const key = toOfficialLabelKey(point);
    const band = bands.get(key) ?? { key, name, points: [] };
    band.points.push({ date: point.snapshotOn, operator, value: point.sites });
    bands.set(key, band);
  }
  return [...bands.values()];
}

export function listOperatorHistory(points: readonly PermitHistoryPoint[], operators: OperatorLookup): OperatorPoint[] {
  const drawablePoints = listDrawableRows(points, operators, (point) => point.snapshotOn);
  return drawablePoints.map(({ row, group: date, operator }) => ({ date, operator, value: row.sites }));
}

export function toSnapshotRange(month: string): { takenAfter: string; takenBefore: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const previousMonthStart = new Date(Date.UTC(year, monthNumber - 2, 1));
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0));
  return { takenAfter: previousMonthStart.toISOString().slice(0, DAY_LENGTH), takenBefore: monthEnd.toISOString().slice(0, DAY_LENGTH) };
}

export function buildPermitSnapshot(
  points: readonly PermitHistoryPoint[],
  month: string,
  operators: OperatorLookup,
  bandLabels: readonly OfficialBandLabel[],
): PermitSnapshot {
  const inMonth = points.filter((point) => point.snapshotOn.slice(0, MONTH_LENGTH) === month).sort(toOfficialLabelComparator(bandLabels));
  const earlier = points.filter((point) => point.snapshotOn.slice(0, MONTH_LENGTH) < month);
  const bands = new Map<string, SnapshotBand>();

  for (const { row: point, group: name, operator } of listDrawableRows(inMonth, operators, toLabelName)) {
    const key = toOfficialLabelKey(point);
    const band = bands.get(key) ?? { key, name, rows: [] };
    band.rows.push({ operator, sites: point.sites, permits: point.permits, added: point.added });
    bands.set(key, band);
  }
  for (const band of bands.values()) band.rows.sort((left, right) => compareOperators(left.operator, right.operator));

  return { snapshotOn: findLatestDay(inMonth), previousSnapshotOn: findLatestDay(earlier), bands: [...bands.values()] };
}

function sumPciCoverage(rows: readonly CountryCompleteness[], rat: "lte" | "nr"): PciCoverage {
  const documented = sum(rows, (row) => row.cells[rat].withPci);
  return { documented, missing: sum(rows, (row) => row.cells[rat].total) - documented };
}

export function sumCompleteness(rows: readonly CountryCompleteness[]): CompletenessTotals {
  return {
    stations: {
      total: sum(rows, (row) => row.stations.total),
      withSectors: sum(rows, (row) => row.stations.withSectors),
      withIdentifiers: sum(rows, (row) => row.stations.withIdentifiers),
    },
    cells: { lte: sumPciCoverage(rows, "lte"), nr: sumPciCoverage(rows, "nr") },
  };
}

export function sumContributions(points: readonly StatisticsHistoryPoint[], interval: StatisticsInterval): ContributionPoint[] {
  const periods = new Map<string, ContributionPoint>();
  for (const { snapshotOn, added } of points) {
    const date = toPeriod(snapshotOn, interval);
    const period = periods.get(date) ?? { date, sectors: 0, identifiers: 0, cellsWithPci: 0 };
    period.sectors += added.sectors;
    period.identifiers += added.identifiers;
    period.cellsWithPci += added.cellsWithPci;
    periods.set(date, period);
  }
  return [...periods.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function toUsagePoints(points: readonly AnalyzerUsagePoint[], interval: StatisticsInterval): UsagePoint[] {
  return points.map(({ startsOn, count }) => ({ date: toPeriod(startsOn, interval), count }));
}
