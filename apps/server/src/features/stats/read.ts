import {
  analyzerUsage,
  bands,
  cells,
  contributionSnapshots,
  extraIdentificators,
  locationPhotos,
  locations,
  lteCells,
  microwaveLinks,
  nrCells,
  officialDatasetSlices,
  officialDatasets,
  officialLocations,
  officialPermits,
  officialSites,
  officialSources,
  operators,
  regions,
  stationPhotoSelections,
  stationSectors,
  stations,
  statsSnapshots,
} from "@openbts/drizzle";
import { PERMIT_STATISTICS_DIMENSIONS, PHOTO_STATISTICS_DIMENSIONS, STATISTICS_DIMENSIONS } from "@openbts/shared/contract";
import type {
  AnalyzerUsagePoint,
  AnalyzerUsageQuery,
  CountryCompleteness,
  CountryStatistics,
  OfficialRat,
  OfficialStatistics,
  PermitBreakdownRow,
  PermitHistoryPoint,
  PermitHistoryQuery,
  PermitStatisticsDimension,
  PhotoBreakdownRow,
  PhotoStatisticsDimension,
  StationBreakdownRow,
  StatisticsDimension,
  StatisticsHistoryPoint,
  StatisticsHistoryQuery,
} from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, asc, count, countDistinct, eq, gte, inArray, isNotNull, lt, lte, max, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { getOrCreate, unique } from "../../lib/collections.js";
import { loadSourceCapabilities } from "../official/capabilities.js";
import { type OfficialVisibility, isPublicSource } from "../official/visibility.js";
import { stationCountries } from "../stations/country.js";
import { CONTRACT_RATS, type CellRow, toStationStatus } from "../stations/serialize.js";
import { cachedStatistics } from "./cache.js";

type HistoryTotals = Omit<StatisticsHistoryPoint, "added">;
type PermitHistoryTotals = Omit<PermitHistoryPoint, "added">;
type SourceCount = { sourceId: number; countryCode: string; value: number };
type SourceImport = { sourceId: number; countryCode: string; layer: "sites" | "microwave_links"; importedAt: string | null };
type OfficialRows = { locations: SourceCount[]; permits: SourceCount[]; microwaveLinks: SourceCount[]; imports: SourceImport[] };
type SourcePermitRow = PermitBreakdownRow & { sourceId: number };

const DAY_MS = 86_400_000;
const DIMENSIONS: Record<StatisticsDimension, SQLWrapper> = {
  region: locations.region_id,
  operator: stations.operator_id,
  rat: cells.rat,
  band: sql`CASE WHEN ${bands.value} = 0 THEN NULL ELSE ${cells.band_id} END`,
};

const PERMIT_DIMENSIONS: Record<PermitStatisticsDimension, SQLWrapper[]> = {
  operator: [officialSites.operator_id],
  region: [officialLocations.region_id],
  rat: [officialPermits.rat],
  label: [officialPermits.rat, officialPermits.label_mhz, officialPermits.label_variant],
};

const isActive = eq(stations.status, "published");
const ofStation = eq(stations.id, stationCountries.stationId);

export function emptyCountryStatistics(countryCode: string): CountryStatistics {
  return { countryCode, stations: { active: 0, awaitingCells: 0, inactive: 0 }, cells: 0, locations: 0, updatedAt: null, official: null };
}

function emptyOfficialStatistics(): OfficialStatistics {
  return { locations: 0, permits: 0, microwaveLinks: 0, permitsImportedAt: null, microwaveLinksImportedAt: null };
}

export function emptyCountryCompleteness(countryCode: string): CountryCompleteness {
  return {
    countryCode,
    stations: { total: 0, withSectors: 0, withIdentifiers: 0 },
    cells: { lte: { total: 0, withPci: 0 }, nr: { total: 0, withPci: 0 } },
  };
}

function nullUnless<T>(isGrouped: boolean, column: SQLWrapper): SQL<T | null> {
  return isGrouped ? sql<T | null>`${column}` : sql<T | null>`NULL`;
}

export function loadCountryStatistics(): Promise<CountryStatistics[]> {
  return cachedStatistics("countries", async () => {
    const [stationRows, cellRows, locationRows] = await Promise.all([
      db
        .select({ countryCode: stationCountries.countryCode, status: stations.status, value: count(), updatedAt: max(stations.updatedAt) })
        .from(stations)
        .innerJoin(stationCountries.table, ofStation)
        .groupBy(stationCountries.countryCode, stations.status),
      db
        .select({ countryCode: stationCountries.countryCode, value: count() })
        .from(cells)
        .innerJoin(stationCountries.table, eq(cells.station_id, stationCountries.stationId))
        .groupBy(stationCountries.countryCode),
      db
        .select({ countryCode: regions.countryCode, value: count() })
        .from(locations)
        .innerJoin(regions, eq(regions.id, locations.region_id))
        .groupBy(regions.countryCode),
    ]);

    const statistics = new Map<string, CountryStatistics>();
    for (const row of stationRows) {
      if (row.countryCode === null) continue;

      const country = getOrCreate(statistics, row.countryCode, emptyCountryStatistics);
      const updatedAt = row.updatedAt?.toISOString() ?? null;
      country.stations[toStationStatus(row.status)] = row.value;
      if (updatedAt !== null && (country.updatedAt === null || updatedAt > country.updatedAt)) country.updatedAt = updatedAt;
    }
    for (const row of cellRows) {
      if (row.countryCode !== null) getOrCreate(statistics, row.countryCode, emptyCountryStatistics).cells = row.value;
    }
    for (const row of locationRows) getOrCreate(statistics, row.countryCode, emptyCountryStatistics).locations = row.value;

    return [...statistics.values()];
  });
}

function loadOfficialRows(): Promise<OfficialRows> {
  return cachedStatistics("official", async () => {
    const [locationRows, permitRows, linkRows, importRows] = await Promise.all([
      db
        .select({ sourceId: officialLocations.source_id, countryCode: regions.countryCode, value: count() })
        .from(officialLocations)
        .innerJoin(regions, eq(regions.id, officialLocations.region_id))
        .groupBy(officialLocations.source_id, regions.countryCode),
      db
        .select({ sourceId: officialSites.source_id, countryCode: regions.countryCode, value: count() })
        .from(officialPermits)
        .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
        .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
        .innerJoin(regions, eq(regions.id, officialLocations.region_id))
        .groupBy(officialSites.source_id, regions.countryCode),
      db
        .select({ sourceId: officialSources.id, countryCode: officialSources.countryCode, value: count() })
        .from(microwaveLinks)
        .innerJoin(officialDatasets, eq(officialDatasets.id, microwaveLinks.dataset_id))
        .innerJoin(officialSources, eq(officialSources.id, officialDatasets.sourceId))
        .groupBy(officialSources.id, officialSources.countryCode),
      db
        .select({
          sourceId: officialSources.id,
          countryCode: officialSources.countryCode,
          layer: officialDatasets.layer,
          importedAt: max(officialDatasetSlices.importedAt),
        })
        .from(officialDatasetSlices)
        .innerJoin(officialDatasets, eq(officialDatasets.id, officialDatasetSlices.datasetId))
        .innerJoin(officialSources, eq(officialSources.id, officialDatasets.sourceId))
        .groupBy(officialSources.id, officialSources.countryCode, officialDatasets.layer),
    ]);

    const imports = importRows.map((row) => ({ ...row, importedAt: row.importedAt ? new Date(row.importedAt).toISOString() : null }));
    return { locations: locationRows, permits: permitRows, microwaveLinks: linkRows, imports };
  });
}

function latest(current: string | null, candidate: string | null): string | null {
  return candidate !== null && (current === null || candidate > current) ? candidate : current;
}

export async function loadOfficialStatistics(visibility: OfficialVisibility): Promise<Map<string, OfficialStatistics>> {
  const [rows, sourceCapabilities] = await Promise.all([loadOfficialRows(), loadSourceCapabilities(visibility)]);
  const official = new Map<string, OfficialStatistics>();
  for (const [countryCode, capabilities] of sourceCapabilities) {
    if (capabilities.official || capabilities.microwaveLinks) official.set(countryCode, emptyOfficialStatistics());
  }

  const counts = [
    ["locations", rows.locations],
    ["permits", rows.permits],
    ["microwaveLinks", rows.microwaveLinks],
  ] as const;
  for (const [field, sourceCounts] of counts) {
    for (const { sourceId, countryCode, value } of sourceCounts) {
      if (isPublicSource(sourceId, visibility)) getOrCreate(official, countryCode, emptyOfficialStatistics)[field] += value;
    }
  }
  for (const { sourceId, countryCode, layer, importedAt } of rows.imports) {
    const country = official.get(countryCode);
    if (!country || !isPublicSource(sourceId, visibility)) continue;

    if (layer === "sites") country.permitsImportedAt = latest(country.permitsImportedAt, importedAt);
    else country.microwaveLinksImportedAt = latest(country.microwaveLinksImportedAt, importedAt);
  }
  return official;
}

export function loadStationBreakdown(groupBy: readonly StatisticsDimension[]): Promise<StationBreakdownRow[]> {
  const dimensions = STATISTICS_DIMENSIONS.filter((dimension) => groupBy.includes(dimension));
  const groupsCells = dimensions.includes("rat") || dimensions.includes("band");

  function grouped<T>(dimension: StatisticsDimension): SQL<T | null> {
    return dimensions.includes(dimension) ? sql<T | null>`${DIMENSIONS[dimension]}` : sql<T | null>`NULL`;
  }

  return cachedStatistics(`stations:${dimensions.join("+")}`, async () => {
    const rows = await db
      .select({
        countryCode: stationCountries.countryCode,
        regionId: grouped<number>("region"),
        operatorId: grouped<number>("operator"),
        rat: grouped<CellRow["rat"]>("rat"),
        bandId: grouped<number>("band"),
        stations: countDistinct(stations.id),
        cells: count(cells.id),
      })
      .from(stations)
      .innerJoin(stationCountries.table, ofStation)
      .leftJoin(locations, eq(locations.id, stations.location_id))
      .leftJoin(cells, eq(cells.station_id, stations.id))
      .leftJoin(bands, eq(bands.id, cells.band_id))
      .where(and(isActive, groupsCells ? isNotNull(cells.id) : undefined))
      .groupBy(stationCountries.countryCode, ...dimensions.map((dimension) => sql`${DIMENSIONS[dimension]}`));

    return rows.flatMap(({ countryCode, ...group }) => {
      const rat = group.rat === null ? null : CONTRACT_RATS[group.rat];
      return countryCode === null || rat === undefined ? [] : [{ countryCode, ...group, rat }];
    });
  });
}

export function loadPhotoBreakdown(groupBy: readonly PhotoStatisticsDimension[]): Promise<PhotoBreakdownRow[]> {
  const dimensions = PHOTO_STATISTICS_DIMENSIONS.filter((dimension) => groupBy.includes(dimension));
  const groupsOperator = dimensions.includes("operator");
  const groupsRegion = dimensions.includes("region");

  return cachedStatistics(`photos:${dimensions.join("+")}`, async () => {
    const rows = await db
      .select({
        countryCode: stationCountries.countryCode,
        operatorId: nullUnless<number>(groupsOperator, stations.operator_id),
        regionId: nullUnless<number>(groupsRegion, locations.region_id),
        photos: countDistinct(locationPhotos.attachment_id),
      })
      .from(stationPhotoSelections)
      .innerJoin(stations, eq(stations.id, stationPhotoSelections.station_id))
      .innerJoin(stationCountries.table, ofStation)
      .innerJoin(locationPhotos, eq(locationPhotos.id, stationPhotoSelections.location_photo_id))
      .leftJoin(locations, eq(locations.id, stations.location_id))
      .where(isActive)
      .groupBy(stationCountries.countryCode, ...(groupsOperator ? [stations.operator_id] : []), ...(groupsRegion ? [locations.region_id] : []));

    return rows.flatMap(({ countryCode, operatorId, regionId, photos }) =>
      countryCode === null ? [] : [{ countryCode, operatorId: operatorId ?? null, regionId: regionId ?? null, photos }],
    );
  });
}

function permitGroupKey({ countryCode, operatorId, regionId, rat, labelMhz, variant }: PermitBreakdownRow): string {
  return JSON.stringify([countryCode, operatorId, regionId, rat, labelMhz, variant]);
}

export async function loadPermitBreakdown(
  groupBy: readonly PermitStatisticsDimension[],
  visibility: OfficialVisibility,
): Promise<PermitBreakdownRow[]> {
  const dimensions = PERMIT_STATISTICS_DIMENSIONS.filter((dimension) => groupBy.includes(dimension));
  const groupsLabel = dimensions.includes("label");
  const groupsRat = groupsLabel || dimensions.includes("rat");
  const groupColumns = unique(dimensions.flatMap((dimension) => PERMIT_DIMENSIONS[dimension]));

  const sourceRows = await cachedStatistics(`permits:${dimensions.join("+")}`, (): Promise<SourcePermitRow[]> =>
    db
      .select({
        sourceId: officialSites.source_id,
        countryCode: regions.countryCode,
        operatorId: nullUnless<number>(dimensions.includes("operator"), officialSites.operator_id),
        regionId: nullUnless<number>(dimensions.includes("region"), officialLocations.region_id),
        rat: nullUnless<OfficialRat>(groupsRat, sql`lower(${officialPermits.rat}::text)`),
        labelMhz: nullUnless<number>(groupsLabel, officialPermits.label_mhz),
        variant: nullUnless<PermitBreakdownRow["variant"]>(groupsLabel, officialPermits.label_variant),
        sites: countDistinct(officialSites.id),
        permits: count(officialPermits.id),
      })
      .from(officialPermits)
      .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
      .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
      .innerJoin(regions, eq(regions.id, officialLocations.region_id))
      .groupBy(officialSites.source_id, regions.countryCode, ...groupColumns.map((column) => sql`${column}`)),
  );

  const rows = new Map<string, PermitBreakdownRow>();
  for (const { sourceId, ...row } of sourceRows) {
    if (!isPublicSource(sourceId, visibility)) continue;

    const sum = getOrCreate(rows, permitGroupKey(row), () => ({ ...row, sites: 0, permits: 0 }));
    sum.sites += row.sites;
    sum.permits += row.permits;
  }
  return [...rows.values()];
}

export function loadCountryCompleteness(): Promise<CountryCompleteness[]> {
  return cachedStatistics("completeness", async () => {
    const hasSectors = sql`EXISTS (SELECT 1 FROM ${stationSectors} WHERE ${stationSectors.station_id} = ${stations.id})`;
    const hasIdentifiers = sql`EXISTS (SELECT 1 FROM ${extraIdentificators} WHERE ${extraIdentificators.station_id} = ${stations.id})`;
    const cellCounts = { countryCode: stationCountries.countryCode, total: count() };

    const [stationRows, lteRows, nrRows] = await Promise.all([
      db
        .select({
          countryCode: stationCountries.countryCode,
          total: count(),
          withSectors: sql<number>`(count(*) FILTER (WHERE ${hasSectors}))::integer`,
          withIdentifiers: sql<number>`(count(*) FILTER (WHERE ${hasIdentifiers}))::integer`,
        })
        .from(stations)
        .innerJoin(stationCountries.table, ofStation)
        .where(isActive)
        .groupBy(stationCountries.countryCode),
      db
        .select({ ...cellCounts, withPci: count(lteCells.pci) })
        .from(lteCells)
        .innerJoin(cells, eq(cells.id, lteCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .innerJoin(stationCountries.table, ofStation)
        .where(isActive)
        .groupBy(stationCountries.countryCode),
      db
        .select({ ...cellCounts, withPci: count(nrCells.pci) })
        .from(nrCells)
        .innerJoin(cells, eq(cells.id, nrCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .innerJoin(stationCountries.table, ofStation)
        .where(isActive)
        .groupBy(stationCountries.countryCode),
    ]);

    const completeness = new Map<string, CountryCompleteness>();
    for (const { countryCode, ...counts } of stationRows) {
      if (countryCode !== null) getOrCreate(completeness, countryCode, emptyCountryCompleteness).stations = counts;
    }
    for (const { countryCode, ...counts } of lteRows) {
      if (countryCode !== null) getOrCreate(completeness, countryCode, emptyCountryCompleteness).cells.lte = counts;
    }
    for (const { countryCode, ...counts } of nrRows) {
      if (countryCode !== null) getOrCreate(completeness, countryCode, emptyCountryCompleteness).cells.nr = counts;
    }
    return [...completeness.values()];
  });
}

function withAdded(points: readonly HistoryTotals[]): StatisticsHistoryPoint[] {
  return points.map((point, index) => {
    const previous = points[index - 1];
    const baseline = previous?.countryCode === point.countryCode ? previous : point;
    return {
      ...point,
      added: {
        stations: point.stations - baseline.stations,
        cells: point.cells - baseline.cells,
        sectors: point.sectors - baseline.sectors,
        identifiers: point.identifiers - baseline.identifiers,
        cellsWithPci: point.cellsWithPci - baseline.cellsWithPci,
      },
    };
  });
}

export async function loadStatisticsHistory(countryCodes: readonly string[], query: StatisticsHistoryQuery): Promise<StatisticsHistoryPoint[]> {
  if (countryCodes.length === 0) return [];

  const { takenAfter, takenBefore, interval } = query;
  const rows = await db
    .select()
    .from(contributionSnapshots)
    .where(
      and(
        inArray(contributionSnapshots.countryCode, [...countryCodes]),
        takenAfter === undefined ? undefined : gte(contributionSnapshots.snapshot_date, new Date(takenAfter)),
        takenBefore === undefined ? undefined : lt(contributionSnapshots.snapshot_date, new Date(Date.parse(takenBefore) + DAY_MS)),
      ),
    )
    .orderBy(asc(contributionSnapshots.countryCode), asc(contributionSnapshots.snapshot_date));

  const points = rows.map((row) => ({
    countryCode: row.countryCode,
    snapshotOn: row.snapshot_date.toISOString().slice(0, 10),
    stations: row.totalStations,
    cells: row.totalCells,
    sectors: row.totalSectors,
    identifiers: row.totalExtraIds,
    cellsWithPci: row.totalCellsWithPCI,
  }));
  if (interval === "day") return withAdded(points);

  const lastOfMonth = new Map(points.map((point) => [countryMonthOf(point), point]));
  return withAdded([...lastOfMonth.values()]);
}

function countryMonthOf({ countryCode, snapshotOn }: { countryCode: string; snapshotOn: string }): string {
  return `${countryCode}:${snapshotOn.slice(0, 7)}`;
}

function permitHistoryGroupKey({ operatorId, rat, labelMhz, variant }: PermitHistoryTotals): string {
  return JSON.stringify([operatorId, rat, labelMhz, variant]);
}

function withPermitChanges(points: readonly PermitHistoryTotals[]): PermitHistoryPoint[] {
  let previousGroups: Map<string, PermitHistoryTotals> | null = null;
  let currentGroups = new Map<string, PermitHistoryTotals>();
  let currentSnapshot: Pick<PermitHistoryTotals, "countryCode" | "snapshotOn"> | null = null;

  return points.map((point) => {
    if (currentSnapshot?.countryCode !== point.countryCode || currentSnapshot.snapshotOn !== point.snapshotOn) {
      previousGroups = currentSnapshot?.countryCode === point.countryCode ? currentGroups : null;
      currentGroups = new Map();
      currentSnapshot = point;
    }
    const key = permitHistoryGroupKey(point);
    const baseline = previousGroups === null ? point : (previousGroups.get(key) ?? { sites: 0, permits: 0 });
    currentGroups.set(key, point);
    return { ...point, added: { sites: point.sites - baseline.sites, permits: point.permits - baseline.permits } };
  });
}

export async function loadPermitHistory(countryCodes: readonly string[], query: PermitHistoryQuery): Promise<PermitHistoryPoint[]> {
  if (countryCodes.length === 0) return [];

  const { groupBy = [], takenAfter, takenBefore, interval } = query;
  const groupsOperator = groupBy.includes("operator");
  const groupsLabel = groupBy.includes("label");
  const isLabelRow = isNotNull(statsSnapshots.rat);
  const rows = await db
    .select({
      countryCode: operators.countryCode,
      snapshotDate: statsSnapshots.snapshot_date,
      operatorId: nullUnless<number>(groupsOperator, statsSnapshots.operator_id),
      rat: nullUnless<OfficialRat>(groupsLabel, sql`lower(${statsSnapshots.rat}::text)`),
      labelMhz: nullUnless<number>(groupsLabel, statsSnapshots.label_mhz),
      variant: nullUnless<PermitHistoryPoint["variant"]>(groupsLabel, statsSnapshots.label_variant),
      sites: groupsLabel
        ? sql<number>`(sum(${statsSnapshots.unique_stations_count}))::integer`
        : sql<number>`(coalesce(sum(${statsSnapshots.unique_stations_count}) FILTER (WHERE NOT ${isLabelRow}), 0))::integer`,
      permits: sql<number>`(coalesce(sum(${statsSnapshots.permits_count}) FILTER (WHERE ${isLabelRow}), 0))::integer`,
    })
    .from(statsSnapshots)
    .innerJoin(operators, eq(operators.id, statsSnapshots.operator_id))
    .where(
      and(
        inArray(operators.countryCode, [...countryCodes]),
        groupsLabel ? isLabelRow : undefined,
        takenAfter === undefined ? undefined : gte(statsSnapshots.snapshot_date, new Date(takenAfter)),
        takenBefore === undefined ? undefined : lt(statsSnapshots.snapshot_date, new Date(Date.parse(takenBefore) + DAY_MS)),
      ),
    )
    .groupBy(
      operators.countryCode,
      statsSnapshots.snapshot_date,
      ...(groupsOperator ? [statsSnapshots.operator_id] : []),
      ...(groupsLabel ? [statsSnapshots.rat, statsSnapshots.label_mhz, statsSnapshots.label_variant] : []),
    )
    .orderBy(asc(operators.countryCode), asc(statsSnapshots.snapshot_date));

  const points = rows.map(({ snapshotDate, ...row }) => ({ ...row, snapshotOn: snapshotDate.toISOString().slice(0, 10) }));
  if (interval === "day") return withPermitChanges(points);

  const lastDayOfMonth = new Map(points.map((point) => [countryMonthOf(point), point.snapshotOn]));
  return withPermitChanges(points.filter((point) => lastDayOfMonth.get(countryMonthOf(point)) === point.snapshotOn));
}

export async function loadAnalyzerUsage({ usedAfter, usedBefore, interval }: AnalyzerUsageQuery): Promise<AnalyzerUsagePoint[]> {
  const rows = await db
    .select()
    .from(analyzerUsage)
    .where(
      and(
        usedAfter === undefined ? undefined : gte(analyzerUsage.date, usedAfter),
        usedBefore === undefined ? undefined : lte(analyzerUsage.date, usedBefore),
      ),
    )
    .orderBy(asc(analyzerUsage.date));
  if (interval === "day") return rows.map((row) => ({ startsOn: row.date, count: row.count }));

  const months = new Map<string, number>();
  for (const row of rows) {
    const startsOn = `${row.date.slice(0, 7)}-01`;
    months.set(startsOn, (months.get(startsOn) ?? 0) + row.count);
  }
  return [...months].map(([startsOn, used]) => ({ startsOn, count: used }));
}
