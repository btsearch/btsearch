import type { Brand, Licensee, MicrowaveLinkBreakdown, MicrowaveLinkHistory, MicrowaveLinkStatisticsDimension } from "@openbts/shared/contract";
import {
  MICROWAVE_LINK_BANDS,
  MICROWAVE_LINK_BUCKETS,
  MICROWAVE_LINK_CAPACITY_BUCKETS,
  MICROWAVE_LINK_LENGTH_BUCKETS,
  MICROWAVE_LINK_OTHER_BUCKET,
} from "@openbts/shared/microwaveLinkUtils";

import type { OperatorCount, OperatorPoint, StackedRow } from "./chartData";
import { OTHERS_COLOR, type OperatorLookup, type StatisticsOperator, compareOperators } from "./operators";
import { toPeriodKey } from "./periods";
import { getLicenseeBrand } from "@/features/map/utils";
import { getBrandColor } from "@/features/station-details/station/utils/brands";

type BandKey = (typeof MICROWAVE_LINK_BANDS)[number]["key"];
type LinkOwner = StatisticsOperator | null;
type Measure = { amount: number; unit: string };
type BucketRange = { key: string; below: number };
type OperatorRow = StackedRow & { operator: StatisticsOperator };

export type LicenseeLookups = { brands: readonly Brand[]; operators: OperatorLookup; brandSortPriorities: ReadonlyMap<number, number> };
type MicrowaveLinkCount = {
  operator: LinkOwner;
  dimension: MicrowaveLinkStatisticsDimension;
  bucket: string | null;
  links: number;
  totalLengthMeters: number;
};
export type MicrowaveLinkSummary = {
  startsOn: string;
  takenAt: string;
  specsAsOf: string | null;
  attributions: string[];
  counts: MicrowaveLinkCount[];
};
type MicrowaveLinkPoint = { date: string; operator: LinkOwner; value: number };
export type MicrowaveLinkTrend = { months: string[]; points: MicrowaveLinkPoint[] };
type BucketLabel = Pick<StackedRow, "name" | "isMono" | "isUnknown"> & { key: string | null };
export type VendorMark = Pick<OperatorCount, "operator" | "isUnknown">;

const E_BAND: BandKey = "70/80";
const VENDOR_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const OTHER_VENDOR_RANK = VENDOR_COLORS.length;
const UNKNOWN_VENDOR_RANK = OTHER_VENDOR_RANK + 1;
const UNKNOWN_VENDOR_COLOR = "var(--muted-foreground)";
const UNKNOWN_BUCKET_KEY = "unknown";
const METERS_PER_KILOMETER = 1000;
const MBPS_PER_GBPS = 1000;

function findLatest(values: readonly (string | null)[]): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value !== null && (latest === null || value > latest)) latest = value;
  }
  return latest;
}

function resolveLicensees(
  licensees: readonly Licensee[],
  { brands, operators, brandSortPriorities }: LicenseeLookups,
): Map<number, StatisticsOperator> {
  const operatorsByBrand = new Map<number, StatisticsOperator>();
  const operatorsByLicensee = new Map<number, StatisticsOperator>();
  for (const licensee of licensees) {
    const brand = getLicenseeBrand(licensee, { brands, operatorsById: operators });
    if (brand === null) continue;

    const operator: StatisticsOperator = operatorsByBrand.get(brand.id) ?? {
      id: brand.id,
      name: brand.name,
      sortPriority: brandSortPriorities.get(brand.id) ?? null,
      color: getBrandColor(brand),
      brand,
    };
    operatorsByBrand.set(brand.id, operator);
    operatorsByLicensee.set(licensee.id, operator);
  }
  return operatorsByLicensee;
}

function findOwner(licenseeId: number | null, operatorsByLicensee: ReadonlyMap<number, StatisticsOperator>): LinkOwner {
  return licenseeId === null ? null : (operatorsByLicensee.get(licenseeId) ?? null);
}

function byOperator(left: Pick<OperatorCount, "operator">, right: Pick<OperatorCount, "operator">): number {
  return compareOperators(left.operator, right.operator);
}

function createVendor(rank: number, name: string, color: string): StatisticsOperator {
  return { id: rank, name, sortPriority: rank, color, brand: null };
}

export function summarizeMicrowaveLinks(breakdowns: readonly MicrowaveLinkBreakdown[], lookups: LicenseeLookups): MicrowaveLinkSummary | null {
  const startsOn = findLatest(breakdowns.map((breakdown) => breakdown.startsOn));
  const takenAt = findLatest(breakdowns.map((breakdown) => breakdown.takenAt));
  if (startsOn === null || takenAt === null) return null;

  const operatorsByLicensee = resolveLicensees(
    breakdowns.flatMap((breakdown) => breakdown.licensees),
    lookups,
  );
  const counts = new Map<string, MicrowaveLinkCount>();
  for (const row of breakdowns.flatMap((breakdown) => breakdown.rows)) {
    const operator = findOwner(row.licenseeId, operatorsByLicensee);
    const key = JSON.stringify([operator?.id ?? null, row.dimension, row.bucket]);
    const count = counts.get(key) ?? { operator, dimension: row.dimension, bucket: row.bucket, links: 0, totalLengthMeters: 0 };
    count.links += row.links;
    count.totalLengthMeters += row.totalLengthMeters;
    counts.set(key, count);
  }

  return {
    startsOn,
    takenAt,
    specsAsOf: findLatest(breakdowns.map((breakdown) => breakdown.specsAsOf)),
    attributions: [...new Set(breakdowns.map((breakdown) => breakdown.attribution))],
    counts: [...counts.values()],
  };
}

export function summarizeMicrowaveLinkHistory(histories: readonly MicrowaveLinkHistory[], lookups: LicenseeLookups): MicrowaveLinkTrend {
  const operatorsByLicensee = resolveLicensees(
    histories.flatMap((history) => history.licensees),
    lookups,
  );
  const points = new Map<string, MicrowaveLinkPoint>();
  function addLinks(startsOn: string, operator: LinkOwner, links: number) {
    const date = toPeriodKey(startsOn, "month");
    const key = JSON.stringify([date, operator?.id ?? null]);
    const point = points.get(key) ?? { date, operator, value: 0 };
    point.value += links;
    points.set(key, point);
  }

  for (const history of histories) {
    const owners = new Set(history.points.map((point) => findOwner(point.licenseeId, operatorsByLicensee)));
    for (const startsOn of history.months) {
      for (const owner of owners) addLinks(startsOn, owner, 0);
    }
    for (const point of history.points) addLinks(point.startsOn, findOwner(point.licenseeId, operatorsByLicensee), point.links);
  }

  const months = new Set(histories.flatMap((history) => history.months.map((startsOn) => toPeriodKey(startsOn, "month"))));
  return { months: [...months].sort(), points: [...points.values()] };
}

export function sumMicrowaveLinks(counts: readonly MicrowaveLinkCount[]): { links: number; totalLengthMeters: number; eBandLinks: number } {
  const totals = { links: 0, totalLengthMeters: 0, eBandLinks: 0 };
  for (const { dimension, bucket, links, totalLengthMeters } of counts) {
    if (dimension === "total") {
      totals.links += links;
      totals.totalLengthMeters += totalLengthMeters;
    }
    if (dimension === "band" && bucket === E_BAND) totals.eBandLinks += links;
  }
  return totals;
}

export function hasKnownBucket(counts: readonly MicrowaveLinkCount[], dimension: MicrowaveLinkStatisticsDimension): boolean {
  return counts.some((count) => count.dimension === dimension && count.bucket !== null && count.links > 0);
}

export function findPreviousMonthChange(
  trend: MicrowaveLinkTrend,
  links: number,
  startsOn: string,
): { change: number; previousMonth: string } | null {
  const currentMonth = toPeriodKey(startsOn, "month");
  const previousMonth = trend.months.filter((month) => month < currentMonth).at(-1);
  if (previousMonth === undefined) return null;

  const previousLinks = trend.points.filter((point) => point.date === previousMonth).reduce((sum, point) => sum + point.value, 0);
  return { change: links - previousLinks, previousMonth };
}

export function listLinkShares(counts: readonly MicrowaveLinkCount[], others: StatisticsOperator): OperatorCount[] {
  return counts
    .filter((count) => count.dimension === "total" && count.links > 0)
    .map((count) => ({ operator: count.operator ?? others, value: count.links }))
    .sort(byOperator);
}

export function listLinkRows(
  counts: readonly MicrowaveLinkCount[],
  dimension: MicrowaveLinkStatisticsDimension,
  buckets: readonly BucketLabel[],
  others: StatisticsOperator,
): StackedRow[] {
  const dimensionCounts = counts.filter((count) => count.dimension === dimension && count.links > 0);
  return buckets.flatMap(({ key, name, isMono, isUnknown }) => {
    const parts = dimensionCounts
      .filter((count) => count.bucket === key)
      .map((count) => ({ operator: count.operator ?? others, value: count.links }))
      .sort(byOperator);
    if (parts.length === 0) return [];

    const total = parts.reduce((sum, part) => sum + part.value, 0);
    return [{ key: key ?? UNKNOWN_BUCKET_KEY, group: null, name, mhz: null, code: null, total, parts, isMono, isUnknown }];
  });
}

export function listVendorRows(
  counts: readonly MicrowaveLinkCount[],
  others: StatisticsOperator,
  names: { otherVendors: string; unknown: string },
): { vendors: VendorMark[]; rows: StackedRow[] } {
  const vendorCounts = counts.filter((count) => count.dimension === "vendor" && count.links > 0);
  const linksByVendor = new Map<string, number>();
  for (const { bucket, links } of vendorCounts) {
    if (bucket !== null) linksByVendor.set(bucket, (linksByVendor.get(bucket) ?? 0) + links);
  }

  const namedVendors = new Map(
    [...linksByVendor]
      .sort(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName))
      .slice(0, VENDOR_COLORS.length)
      .map(([name], rank) => [name, createVendor(rank, name, VENDOR_COLORS[rank])]),
  );
  const otherVendor = createVendor(OTHER_VENDOR_RANK, names.otherVendors, OTHERS_COLOR);
  const unknownVendor = createVendor(UNKNOWN_VENDOR_RANK, names.unknown, UNKNOWN_VENDOR_COLOR);

  const rows = new Map<number, OperatorRow>();
  const vendors = new Map<number, VendorMark>();
  for (const { operator: owner, bucket, links } of vendorCounts) {
    const operator = owner ?? others;
    const vendor: VendorMark = bucket === null ? { operator: unknownVendor, isUnknown: true } : { operator: namedVendors.get(bucket) ?? otherVendor };
    const row: OperatorRow = rows.get(operator.id) ?? {
      key: String(operator.id),
      group: null,
      name: operator.name,
      mhz: null,
      code: null,
      total: 0,
      parts: [],
      operator,
    };
    const part = row.parts.find((entry) => entry.operator.id === vendor.operator.id);
    if (part === undefined) row.parts.push({ ...vendor, value: links });
    else part.value += links;
    row.total += links;
    rows.set(operator.id, row);
    vendors.set(vendor.operator.id, vendor);
  }

  const sortedRows = [...rows.values()].sort(byOperator);
  for (const row of sortedRows) row.parts.sort(byOperator);
  return { vendors: [...vendors.values()].sort(byOperator), rows: sortedRows };
}

export function toOperatorPoints(points: readonly MicrowaveLinkPoint[], others: StatisticsOperator): OperatorPoint[] {
  return points.map(({ date, operator, value }) => ({ date, operator: operator ?? others, value }));
}

function toKilometers(meters: number): Measure {
  return { amount: meters / METERS_PER_KILOMETER, unit: "km" };
}

function toRate(mbps: number): Measure {
  return mbps < MBPS_PER_GBPS ? { amount: mbps, unit: "Mb/s" } : { amount: mbps / MBPS_PER_GBPS, unit: "Gb/s" };
}

function describeRange(from: number, to: number, measure: (value: number) => Measure, language: string): string {
  const format = ({ amount, unit }: Measure) => `${amount.toLocaleString(language)} ${unit}`;
  if (from === 0) return `< ${format(measure(to))}`;
  if (to === Number.POSITIVE_INFINITY) return `>= ${format(measure(from))}`;

  const lower = measure(from);
  const upper = measure(to);
  if (lower.unit !== upper.unit) return `${format(lower)} - ${format(upper)}`;
  return `${lower.amount.toLocaleString(language)}-${format(upper)}`;
}

function listRangeBuckets(ranges: readonly BucketRange[], measure: (value: number) => Measure, language: string): BucketLabel[] {
  return ranges.map(({ key, below }, index) => ({ key, name: describeRange(index === 0 ? 0 : ranges[index - 1].below, below, measure, language) }));
}

function listCodeBuckets(keys: readonly string[], otherName: string, toName: (key: string) => string): BucketLabel[] {
  return keys.map((key) => (key === MICROWAVE_LINK_OTHER_BUCKET ? { key, name: otherName } : { key, name: toName(key), isMono: true }));
}

export function listBandBuckets(otherName: string): BucketLabel[] {
  return listCodeBuckets(MICROWAVE_LINK_BUCKETS.band, otherName, (key) => `${key} GHz`);
}

export function listLengthBuckets(language: string): BucketLabel[] {
  return listRangeBuckets(
    MICROWAVE_LINK_LENGTH_BUCKETS.map(({ key, belowMeters }) => ({ key, below: belowMeters })),
    toKilometers,
    language,
  );
}

export function listTypeBuckets(otherName: string): BucketLabel[] {
  return listCodeBuckets(MICROWAVE_LINK_BUCKETS.type, otherName, (key) => key);
}

export function listCapacityBuckets(language: string, unknownName: string): BucketLabel[] {
  const ranges = MICROWAVE_LINK_CAPACITY_BUCKETS.map(({ key, belowMbps }) => ({ key, below: belowMbps }));
  return [...listRangeBuckets(ranges, toRate, language), { key: null, name: unknownName, isUnknown: true }];
}
