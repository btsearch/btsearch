import type {
  AnalyzerUsagePoint,
  Band,
  CellRat,
  CountryCompleteness,
  OfficialRat,
  PermitBreakdownRow,
  PermitHistoryPoint,
  Region,
  StationBreakdownRow,
  StatisticsHistoryPoint,
  StatisticsInterval,
} from "@openbts/shared/contract";
import { formatPermitLabel } from "@openbts/shared/permitLabel";

import { toPercent } from "./format";
import { type OperatorLookup, type StatisticsOperator, compareOperators } from "./operators";
import { toPeriodKey } from "./periods";
import { type OfficialLabelParts, toOfficialLabelKey, toOfficialRatOption } from "@/features/official/labels";
import { getBandCode } from "@/features/station-details/station/utils/bands";

export type Series = { key: string; label: string; color: string };
type PermitCounts = Pick<PermitBreakdownRow, "sites" | "permits">;
type StationCounts = Pick<StationBreakdownRow, "stations" | "cells">;
type WithOperator<T> = T & { operator: StatisticsOperator };
type DrawableRow<T, C> = { row: T; category: C; operator: StatisticsOperator };

type PermitBreakdowns = Record<"totals" | "byRat" | "byOperator", readonly PermitBreakdownRow[]>;
type StationBreakdowns = Record<"totals" | "byRat" | "byOperator", readonly StationBreakdownRow[]>;
type RowLabel = Pick<StackedRow, "key" | "group" | "name" | "mhz" | "code">;
type BandParts = { rat: string | null; labelMhz?: number | null; variant?: string | null };
export type OperatorCount = { operator: StatisticsOperator; value: number };
export type StackedRow = {
  key: string;
  group: string | null;
  name: string;
  mhz: number | null;
  code: string | null;
  total: number;
  parts: OperatorCount[];
};
type RegisterRatShare = PermitCounts & { rat: OfficialRat; label: string; sharePct: number };
export type RegisterSummary = PermitCounts & { rats: RegisterRatShare[]; operators: WithOperator<PermitCounts>[] };
type DatabaseRatShare = StationCounts & { rat: CellRat; label: string; sharePct: number };
export type DatabaseSummary = StationCounts & { rats: DatabaseRatShare[]; operators: WithOperator<StationCounts>[] };
export type OperatorPoint = { date: string; operator: StatisticsOperator; value: number };
export type BandHistory = { key: string; name: string; points: OperatorPoint[] };
export type SnapshotRow = WithOperator<Pick<PermitHistoryPoint, "sites" | "permits" | "added">>;
export type SnapshotBand = { key: string; name: string; rows: SnapshotRow[] };
export type PermitSnapshot = { snapshotOn: string | null; previousSnapshotOn: string | null; bands: SnapshotBand[] };
export type CompletenessTotals = Omit<CountryCompleteness, "countryCode">;
type ContributionPoint = { date: string; sectors: number; identifiers: number; cellsWithPci: number };
type UsagePoint = { date: string; count: number };

const RAT_ORDER: readonly string[] = ["nr", "lte", "umts", "cdma", "gsm", "iot"];
const RAILWAY_CODE = toOfficialRatOption("gsmR").label;

function toRatRank(rat: string | null): number {
  const rank = rat === null ? -1 : RAT_ORDER.indexOf(rat);
  return rank === -1 ? RAT_ORDER.length : rank;
}

function compareBands(left: BandParts, right: BandParts): number {
  return (
    toRatRank(left.rat) - toRatRank(right.rat) ||
    Number(left.variant === "railway") - Number(right.variant === "railway") ||
    (left.labelMhz ?? Number.MAX_SAFE_INTEGER) - (right.labelMhz ?? Number.MAX_SAFE_INTEGER)
  );
}

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

function listDrawableRows<T extends { operatorId: number | null }, C>(
  rows: readonly T[],
  operators: OperatorLookup,
  findCategory: (row: T) => C | null | undefined,
): DrawableRow<T, C>[] {
  return rows.flatMap((row) => {
    const category = findCategory(row);
    const operator = row.operatorId === null ? undefined : operators.get(row.operatorId);
    return category === null || category === undefined || operator === undefined ? [] : [{ row, category, operator }];
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

function stackRows(rows: readonly (RowLabel & OperatorCount)[]): StackedRow[] {
  const stacked = new Map<string, StackedRow>();
  for (const { operator, value, ...label } of rows) {
    const row = stacked.get(label.key) ?? { ...label, total: 0, parts: [] };
    const part = row.parts.find((entry) => entry.operator.id === operator.id);
    if (part === undefined) row.parts.push({ operator, value });
    else part.value += value;
    row.total += value;
    stacked.set(label.key, row);
  }
  for (const row of stacked.values()) row.parts.sort((left, right) => compareOperators(left.operator, right.operator));
  return [...stacked.values()];
}

function findLatestDay(points: readonly Pick<PermitHistoryPoint, "snapshotOn">[]): string | null {
  let latest: string | null = null;
  for (const { snapshotOn } of points) {
    if (latest === null || snapshotOn > latest) latest = snapshotOn;
  }
  return latest;
}

function toLabelName({ rat, labelMhz, variant }: OfficialLabelParts): string | null {
  if (rat === null || labelMhz === null) return null;
  return formatPermitLabel({ rat: rat.toUpperCase(), mhz: labelMhz, variant: variant ?? "commercial" });
}

export function summarizePermits(breakdowns: PermitBreakdowns, operators: OperatorLookup): RegisterSummary {
  const total = sumPermitCounts(breakdowns.totals);
  const rats = [...groupRows(breakdowns.byRat, (row) => row.rat)]
    .map(([rat, rows]): RegisterRatShare => {
      const counts = sumPermitCounts(rows);
      return { ...counts, rat, label: toOfficialRatOption(rat).label, sharePct: toPercent(counts.sites, total.sites) };
    })
    .sort(compareBands);

  return { ...total, rats, operators: listOperatorCounts(breakdowns.byOperator, operators, sumPermitCounts) };
}

export function summarizeStations(breakdowns: StationBreakdowns, operators: OperatorLookup): DatabaseSummary {
  const total = sumStationCounts(breakdowns.totals);
  const rats = [...groupRows(breakdowns.byRat, (row) => row.rat)]
    .map(([rat, rows]): DatabaseRatShare => {
      const counts = sumStationCounts(rows);
      return { ...counts, rat, label: rat.toUpperCase(), sharePct: toPercent(counts.stations, total.stations) };
    })
    .sort(compareBands);

  return { ...total, rats, operators: listOperatorCounts(breakdowns.byOperator, operators, sumStationCounts) };
}

export function listLabelRows(rows: readonly PermitBreakdownRow[], operators: OperatorLookup): StackedRow[] {
  const sortedRows = [...rows].sort(compareBands);
  return stackRows(
    listDrawableRows(sortedRows, operators, toLabelName).map(({ row, category: name, operator }) => ({
      key: toOfficialLabelKey(row),
      group: row.rat === null ? null : toOfficialRatOption(row.rat).label,
      name,
      mhz: row.labelMhz,
      code: row.variant === "railway" ? RAILWAY_CODE : null,
      operator,
      value: row.sites,
    })),
  );
}

export function listBandRows(rows: readonly StationBreakdownRow[], operators: OperatorLookup, bands: readonly Band[]): StackedRow[] {
  const bandsById = new Map(bands.map((band, position) => [band.id, { band, position }]));
  return stackRows(
    listDrawableRows(rows, operators, (row) => (row.bandId === null ? undefined : bandsById.get(row.bandId)))
      .sort((left, right) => compareBands(left.category.band, right.category.band) || left.category.position - right.category.position)
      .map(({ row, category: { band }, operator }) => ({
        key: String(band.id),
        group: band.rat.toUpperCase(),
        name: band.name,
        mhz: band.labelMhz,
        code: getBandCode(band) ?? (band.variant === "railway" ? RAILWAY_CODE : null),
        operator,
        value: row.stations,
      })),
  );
}

export function listRegionRows<T extends { regionId: number | null; operatorId: number | null }>(
  rows: readonly T[],
  readValue: (row: T) => number,
  operators: OperatorLookup,
  regions: readonly Region[],
): StackedRow[] {
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  const drawableRows = listDrawableRows(rows, operators, (row) => (row.regionId === null ? undefined : regionNames.get(row.regionId)));
  const stacked = stackRows(
    drawableRows.map(({ row, category: name, operator }) => ({
      key: String(row.regionId),
      group: null,
      name,
      mhz: null,
      code: null,
      operator,
      value: readValue(row),
    })),
  );
  return stacked.sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
}

export function groupHistoryByLabel(points: readonly PermitHistoryPoint[], operators: OperatorLookup): BandHistory[] {
  const bands = new Map<string, BandHistory>();
  const sortedPoints = [...points].sort(compareBands);
  for (const { row: point, category: name, operator } of listDrawableRows(sortedPoints, operators, toLabelName)) {
    const key = toOfficialLabelKey(point);
    const band = bands.get(key) ?? { key, name, points: [] };
    band.points.push({ date: point.snapshotOn, operator, value: point.sites });
    bands.set(key, band);
  }
  return [...bands.values()];
}

export function listOperatorHistory(points: readonly PermitHistoryPoint[], operators: OperatorLookup): OperatorPoint[] {
  const drawablePoints = listDrawableRows(points, operators, (point) => point.snapshotOn);
  return drawablePoints.map(({ row, category: date, operator }) => ({ date, operator, value: row.sites }));
}

export function buildPermitSnapshot(points: readonly PermitHistoryPoint[], month: string, operators: OperatorLookup): PermitSnapshot {
  const inMonth = points.filter((point) => toPeriodKey(point.snapshotOn, "month") === month).sort(compareBands);
  const earlier = points.filter((point) => toPeriodKey(point.snapshotOn, "month") < month);
  const bands = new Map<string, SnapshotBand>();

  for (const { row: point, category: name, operator } of listDrawableRows(inMonth, operators, toLabelName)) {
    const key = toOfficialLabelKey(point);
    const band = bands.get(key) ?? { key, name, rows: [] };
    band.rows.push({ operator, sites: point.sites, permits: point.permits, added: point.added });
    bands.set(key, band);
  }
  for (const band of bands.values()) band.rows.sort((left, right) => compareOperators(left.operator, right.operator));

  return { snapshotOn: findLatestDay(inMonth), previousSnapshotOn: findLatestDay(earlier), bands: [...bands.values()] };
}

function sumCellsWithPci(rows: readonly CountryCompleteness[], rat: "lte" | "nr"): CompletenessTotals["cells"]["lte"] {
  return { total: sum(rows, (row) => row.cells[rat].total), withPci: sum(rows, (row) => row.cells[rat].withPci) };
}

export function sumCompleteness(rows: readonly CountryCompleteness[]): CompletenessTotals {
  return {
    stations: {
      total: sum(rows, (row) => row.stations.total),
      withSectors: sum(rows, (row) => row.stations.withSectors),
      withIdentifiers: sum(rows, (row) => row.stations.withIdentifiers),
    },
    cells: { lte: sumCellsWithPci(rows, "lte"), nr: sumCellsWithPci(rows, "nr") },
  };
}

export function sumContributions(points: readonly StatisticsHistoryPoint[], interval: StatisticsInterval): ContributionPoint[] {
  const periods = new Map<string, ContributionPoint>();
  for (const { snapshotOn, added } of points) {
    const date = toPeriodKey(snapshotOn, interval);
    const period = periods.get(date) ?? { date, sectors: 0, identifiers: 0, cellsWithPci: 0 };
    period.sectors += added.sectors;
    period.identifiers += added.identifiers;
    period.cellsWithPci += added.cellsWithPci;
    periods.set(date, period);
  }
  return [...periods.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function toUsagePoints(points: readonly AnalyzerUsagePoint[], interval: StatisticsInterval): UsagePoint[] {
  return points.map(({ startsOn, count }) => ({ date: toPeriodKey(startsOn, interval), count }));
}
