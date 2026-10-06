import {
  analyzerUsage,
  bands,
  cells,
  contributionSnapshots,
  extraIdentificators,
  locations,
  lteCells,
  nrCells,
  regions,
  stationSectors,
  stations,
  ukeImportMetadata,
  ukeLocations,
  ukePermits,
  ukeRadiolines,
} from "@openbts/drizzle";
import { STATISTICS_DIMENSIONS } from "@openbts/shared/contract";
import type {
  AnalyzerUsagePoint,
  AnalyzerUsageQuery,
  CountryCompleteness,
  CountryStatistics,
  OfficialStatistics,
  StationBreakdownRow,
  StatisticsDimension,
  StatisticsHistoryPoint,
  StatisticsHistoryQuery,
} from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, asc, count, countDistinct, eq, gte, inArray, isNotNull, lt, lte, max, sql } from "drizzle-orm";

import { LEGACY_COUNTRY_CODE } from "../../constants.js";
import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";
import { stationCountries } from "../stations/country.js";
import { CONTRACT_RATS, type CellRow, toStationStatus } from "../stations/serialize.js";

type HistoryTotals = Omit<StatisticsHistoryPoint, "added">;

const DAY_MS = 86_400_000;
const STATISTICS_CACHE = { freshTtlSeconds: 600, staleTtlSeconds: 86_400 };
const REGISTER_COUNTRY_CODE = LEGACY_COUNTRY_CODE;
const DIMENSIONS: Record<StatisticsDimension, SQLWrapper> = {
  region: locations.region_id,
  operator: stations.operator_id,
  rat: cells.rat,
  band: sql`CASE WHEN ${bands.value} = 0 THEN NULL ELSE ${cells.band_id} END`,
};

const isActive = eq(stations.status, "published");
const ofStation = eq(stations.id, stationCountries.stationId);

async function cachedStatistics<T>(name: string, load: () => Promise<T>): Promise<T> {
  if (!redis.isReady) return load();

  const { value } = await withRedisStaleCache(`statistics:v2:${name}`, STATISTICS_CACHE, load);
  return value;
}

export function emptyCountryStatistics(countryCode: string): CountryStatistics {
  return { countryCode, stations: { active: 0, awaitingCells: 0, inactive: 0 }, cells: 0, locations: 0, updatedAt: null, official: null };
}

function lastImport(types: string[]) {
  return db
    .select({ value: max(ukeImportMetadata.last_import_date) })
    .from(ukeImportMetadata)
    .where(and(eq(ukeImportMetadata.status, "success"), inArray(ukeImportMetadata.import_type, types)));
}

async function loadOfficialStatistics(): Promise<OfficialStatistics> {
  const [[locationCount], [permitCount], [linkCount], [permitImport], [linkImport]] = await Promise.all([
    db.select({ value: count() }).from(ukeLocations),
    db.select({ value: count() }).from(ukePermits),
    db.select({ value: count() }).from(ukeRadiolines),
    lastImport(["permits", "device_registry"]),
    lastImport(["radiolines"]),
  ]);

  return {
    locations: locationCount?.value ?? 0,
    permits: permitCount?.value ?? 0,
    microwaveLinks: linkCount?.value ?? 0,
    permitsImportedAt: permitImport?.value ? new Date(permitImport.value).toISOString() : null,
    microwaveLinksImportedAt: linkImport?.value ? new Date(linkImport.value).toISOString() : null,
  };
}

export function emptyCountryCompleteness(countryCode: string): CountryCompleteness {
  return {
    countryCode,
    stations: { total: 0, withSectors: 0, withIdentifiers: 0 },
    cells: { lte: { total: 0, withPci: 0 }, nr: { total: 0, withPci: 0 } },
  };
}

function getOrCreate<T>(byCountry: Map<string, T>, countryCode: string, createEmpty: (countryCode: string) => T): T {
  const existing = byCountry.get(countryCode);
  if (existing !== undefined) return existing;

  const created = createEmpty(countryCode);
  byCountry.set(countryCode, created);
  return created;
}

export function loadCountryStatistics(): Promise<CountryStatistics[]> {
  return cachedStatistics("countries", async () => {
    const [stationRows, cellRows, locationRows, official] = await Promise.all([
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
      loadOfficialStatistics(),
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
    getOrCreate(statistics, REGISTER_COUNTRY_CODE, emptyCountryStatistics).official = official;

    return [...statistics.values()];
  });
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

  const lastOfMonth = new Map(points.map((point) => [`${point.countryCode}:${point.snapshotOn.slice(0, 7)}`, point]));
  return withAdded([...lastOfMonth.values()]);
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
