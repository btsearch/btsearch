import { microwaveLinkSnapshotCounts, microwaveLinkSnapshots, officialSources } from "@openbts/drizzle";
import { MICROWAVE_LINK_STATISTICS_DIMENSIONS } from "@openbts/shared/contract";
import type {
  MicrowaveLinkBreakdown,
  MicrowaveLinkBreakdownRow,
  MicrowaveLinkHistory,
  MicrowaveLinkHistoryQuery,
  MicrowaveLinkStatisticsDimension,
} from "@openbts/shared/contract";
import { MICROWAVE_LINK_BUCKETS } from "@openbts/shared/microwaveLinkUtils";
import { asc, eq, inArray } from "drizzle-orm";

import db from "../../../database/psql.js";
import { getOrCreate, unique } from "../../../lib/collections.js";
import { fetchLicensees } from "../../official/licensees.js";
import { type OfficialVisibility, isPublicSource } from "../../official/visibility.js";
import { cachedStatistics } from "../cache.js";
import { firstDayOfMonth } from "./snapshot.js";

export type SourceMicrowaveLinkBreakdown = MicrowaveLinkBreakdown & { sourceId: number };
export type SourceMicrowaveLinkHistory = MicrowaveLinkHistory & { sourceId: number };
type SnapshotHeader = Omit<SourceMicrowaveLinkBreakdown, "licensees" | "rows"> & { id: number };
type MonthRange = Pick<MicrowaveLinkHistoryQuery, "takenAfter" | "takenBefore">;

const TOTAL: MicrowaveLinkStatisticsDimension = "total";
const BUCKET_ORDER: Record<MicrowaveLinkStatisticsDimension, readonly string[]> = { total: [], ...MICROWAVE_LINK_BUCKETS, vendor: [] };

function isMicrowaveLinkDimension(dimension: string): dimension is MicrowaveLinkStatisticsDimension {
  return MICROWAVE_LINK_STATISTICS_DIMENSIONS.some((known) => known === dimension);
}

function compareNullsLast<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return compare(a, b);
}

function compareRows(a: MicrowaveLinkBreakdownRow, b: MicrowaveLinkBreakdownRow): number {
  const buckets = BUCKET_ORDER[a.dimension];
  return (
    MICROWAVE_LINK_STATISTICS_DIMENSIONS.indexOf(a.dimension) - MICROWAVE_LINK_STATISTICS_DIMENSIONS.indexOf(b.dimension) ||
    compareNullsLast(a.bucket, b.bucket, (x, y) => buckets.indexOf(x) - buckets.indexOf(y) || x.localeCompare(y)) ||
    compareNullsLast(a.licenseeId, b.licenseeId, (x, y) => x - y)
  );
}

function isShownTo(countryCodes: readonly string[], visibility: OfficialVisibility) {
  return ({ sourceId, countryCode }: { sourceId: number; countryCode: string }) =>
    isPublicSource(sourceId, visibility) && countryCodes.includes(countryCode);
}

function loadSnapshotHeaders(): Promise<SnapshotHeader[]> {
  return cachedStatistics("microwave-links:snapshots", async () => {
    const rows = await db
      .select({
        id: microwaveLinkSnapshots.id,
        sourceId: microwaveLinkSnapshots.sourceId,
        sourceKey: officialSources.key,
        countryCode: officialSources.countryCode,
        attribution: officialSources.attribution,
        startsOn: microwaveLinkSnapshots.startsOn,
        takenAt: microwaveLinkSnapshots.takenAt,
        specsDate: microwaveLinkSnapshots.specsDate,
      })
      .from(microwaveLinkSnapshots)
      .innerJoin(officialSources, eq(officialSources.id, microwaveLinkSnapshots.sourceId))
      .orderBy(asc(officialSources.key), asc(microwaveLinkSnapshots.startsOn));
    return rows.map(({ takenAt, specsDate, ...header }) => ({
      ...header,
      takenAt: takenAt.toISOString(),
      specsAsOf: specsDate?.toISOString() ?? null,
    }));
  });
}

function headersOf(headers: readonly SnapshotHeader[], startsOn: string | undefined): SnapshotHeader[] {
  if (startsOn !== undefined) return headers.filter((header) => header.startsOn === startsOn);
  return [...new Map(headers.map((header) => [header.sourceId, header])).values()];
}

export async function loadMicrowaveLinkBreakdowns(startsOn?: string): Promise<SourceMicrowaveLinkBreakdown[]> {
  const headers = headersOf(await loadSnapshotHeaders(), startsOn);
  if (headers.length === 0) return [];

  return cachedStatistics(`microwave-links:${startsOn ?? "newest"}`, async () => {
    const rows = await db
      .select({
        snapshotId: microwaveLinkSnapshotCounts.snapshotId,
        licenseeId: microwaveLinkSnapshotCounts.licenseeId,
        dimension: microwaveLinkSnapshotCounts.dimension,
        bucket: microwaveLinkSnapshotCounts.bucket,
        links: microwaveLinkSnapshotCounts.linksCount,
        totalLengthMeters: microwaveLinkSnapshotCounts.lengthSumMeters,
      })
      .from(microwaveLinkSnapshotCounts)
      .where(
        inArray(
          microwaveLinkSnapshotCounts.snapshotId,
          headers.map((header) => header.id),
        ),
      );
    const licensees = await fetchLicensees(unique(rows.map((row) => row.licenseeId)));
    const rowsBySnapshot = Map.groupBy(rows, (row) => row.snapshotId);

    return headers.map(({ id, ...header }) => ({
      ...header,
      licensees: licensees.filter((licensee) => licensee.sourceKey === header.sourceKey),
      rows: (rowsBySnapshot.get(id) ?? [])
        .flatMap(({ snapshotId: _snapshotId, dimension, ...row }) => (isMicrowaveLinkDimension(dimension) ? [{ ...row, dimension }] : []))
        .sort(compareRows),
    }));
  });
}

export function filterMicrowaveLinkBreakdowns(
  breakdowns: readonly SourceMicrowaveLinkBreakdown[],
  countryCodes: readonly string[],
  visibility: OfficialVisibility,
): MicrowaveLinkBreakdown[] {
  return breakdowns.filter(isShownTo(countryCodes, visibility)).map(({ sourceId: _sourceId, ...breakdown }) => breakdown);
}

export function loadMicrowaveLinkHistories(): Promise<SourceMicrowaveLinkHistory[]> {
  return cachedStatistics("microwave-links:history", async () => {
    const [headers, totals] = await Promise.all([
      loadSnapshotHeaders(),
      db
        .select({
          snapshotId: microwaveLinkSnapshotCounts.snapshotId,
          licenseeId: microwaveLinkSnapshotCounts.licenseeId,
          links: microwaveLinkSnapshotCounts.linksCount,
          totalLengthMeters: microwaveLinkSnapshotCounts.lengthSumMeters,
        })
        .from(microwaveLinkSnapshotCounts)
        .where(eq(microwaveLinkSnapshotCounts.dimension, TOTAL))
        .orderBy(asc(microwaveLinkSnapshotCounts.licenseeId)),
    ]);
    const licensees = await fetchLicensees(unique(totals.map((total) => total.licenseeId)));
    const totalsBySnapshot = Map.groupBy(totals, (total) => total.snapshotId);

    const histories = new Map<string, SourceMicrowaveLinkHistory>();
    for (const { id, sourceId, sourceKey, countryCode, startsOn } of headers) {
      const history = getOrCreate(histories, sourceKey, () => ({
        sourceId,
        sourceKey,
        countryCode,
        licensees: licensees.filter((licensee) => licensee.sourceKey === sourceKey),
        months: [],
        points: [],
      }));
      history.months.push(startsOn);
      for (const { snapshotId: _snapshotId, ...total } of totalsBySnapshot.get(id) ?? []) history.points.push({ startsOn, ...total });
    }
    return [...histories.values()];
  });
}

export function filterMicrowaveLinkHistories(
  histories: readonly SourceMicrowaveLinkHistory[],
  countryCodes: readonly string[],
  visibility: OfficialVisibility,
  { takenAfter, takenBefore }: MonthRange,
): MicrowaveLinkHistory[] {
  const firstMonth = takenAfter === undefined ? undefined : firstDayOfMonth(takenAfter);
  const isInRange = (month: string) => (firstMonth === undefined || month >= firstMonth) && (takenBefore === undefined || month <= takenBefore);

  return histories.filter(isShownTo(countryCodes, visibility)).map(({ sourceId: _sourceId, licensees, months, points, ...history }) => {
    const shownPoints = points.filter((point) => isInRange(point.startsOn));
    const named = new Set(shownPoints.map((point) => point.licenseeId));
    return { ...history, licensees: licensees.filter((licensee) => named.has(licensee.id)), months: months.filter(isInRange), points: shownPoints };
  });
}
