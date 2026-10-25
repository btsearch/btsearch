import { cellCopies, contributorMonths, countries, observedCellSummaries, observedCells, operators, trailSquares } from "@openbts/drizzle";
import type { ObservationStatistics } from "@openbts/shared/contract";
import { and, asc, count, eq, gte, inArray, max, notExists, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";
import { isPublicObservedCell } from "../observed/cells/visibility.js";
import { selectReportedCodes } from "../observed/networks.js";
import { selectPublicSiteTotals } from "../observed/sites/visibility.js";
import { SQUARE_ZOOM, tileCenter, tileOfQuadkey } from "../observed/tiles/squares.js";

type SquaresInParent = { parent: number; squares: number };
type PublicNetwork = { plmn: string; country_code: string };
type ShownMonth = ObservationStatistics["months"][number];

const OBSERVATION_STATISTICS_KEY = "statistics:v2:observations";
const OBSERVATION_STATISTICS_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 86_400 };
const MONTHS_SHOWN = 12;
const FEWEST_PEOPLE_SHOWN = 3;
const EARTH_CIRCUMFERENCE_KM = 40_075.016_686;
const PARENT_ZOOM = 12;
const PARENT_SHIFT = 2 * (SQUARE_ZOOM - PARENT_ZOOM);

export function areaOfSquaresKm2(parents: readonly SquaresInParent[]): number {
  return parents.reduce((area, { parent, squares }) => {
    const { latitude } = tileCenter(tileOfQuadkey(parent, PARENT_ZOOM));
    const side = (EARTH_CIRCUMFERENCE_KM * Math.cos((latitude * Math.PI) / 180)) / 2 ** SQUARE_ZOOM;
    return area + squares * side * side;
  }, 0);
}

export function shownMonth(startsOn: string, samples: number, people: number): ShownMonth {
  if (people > 0 && people < FEWEST_PEOPLE_SHOWN) return { startsOn, samples: null, people: null };
  return { startsOn, samples, people };
}

export function lastMonths(now: Date, months = MONTHS_SHOWN): string[] {
  return Array.from({ length: months }, (_, index) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1));
    return month.toISOString().slice(0, 10);
  });
}

export function emptyObservationStatistics(countryCode: string, months: readonly string[]): ObservationStatistics {
  return {
    countryCode,
    sites: { unmatched: 0, suggested: 0, matched: 0 },
    observedCells: 0,
    squares: 0,
    areaSquareKilometers: 0,
    months: months.map((startsOn) => ({ startsOn, samples: 0, people: 0 })),
    lastMeasuredOn: null,
  };
}

export async function loadObservationCountryCodes(codes?: readonly string[]): Promise<string[]> {
  const rows = await db
    .select({ code: countries.code })
    .from(countries)
    .where(and(eq(countries.isVisible, true), eq(countries.observationsPublic, true), codes ? inArray(countries.code, [...codes]) : undefined))
    .orderBy(asc(countries.code));
  return rows.map((row) => row.code);
}

export function loadPublicNetworks(): Promise<PublicNetwork[]> {
  const reported = selectReportedCodes();
  return db
    .select({ plmn: reported.reportedCode, country_code: operators.countryCode })
    .from(reported)
    .innerJoin(operators, eq(operators.id, reported.operatorId))
    .innerJoin(countries, eq(countries.code, operators.countryCode))
    .where(and(eq(countries.isVisible, true), eq(countries.observationsPublic, true)));
}

export function selectSquareTotals(networks: readonly PublicNetwork[]) {
  const parent = sql<number>`(${trailSquares.bin} >> ${sql.raw(String(PARENT_SHIFT))})::int`;
  const countryCode = sql<string>`network.country_code`;
  return db
    .select({ countryCode, parent, squares: sql<number>`count(DISTINCT ${trailSquares.bin})::int` })
    .from(sql`jsonb_to_recordset(${JSON.stringify(networks)}::jsonb) AS network (plmn varchar(6), country_code char(2))`)
    .innerJoin(trailSquares, and(eq(trailSquares.plmn, sql`network.plmn`), eq(trailSquares.zoom, SQUARE_ZOOM)))
    .groupBy(countryCode, parent);
}

async function loadSquares() {
  const networks = await loadPublicNetworks();
  return networks.length === 0 ? [] : selectSquareTotals(networks);
}

export function selectPublicCellTotals() {
  const copy = db.select({ id: cellCopies.observedCellId }).from(cellCopies).where(eq(cellCopies.observedCellId, observedCells.id));
  const network = selectReportedCodes();
  return db
    .select({ countryCode: operators.countryCode, cells: count(), lastMeasuredOn: max(observedCellSummaries.lastSeenOn) })
    .from(observedCells)
    .innerJoin(network, eq(network.reportedCode, observedCells.plmn))
    .innerJoin(operators, eq(operators.id, network.operatorId))
    .leftJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, observedCells.id))
    .where(and(notExists(copy), isPublicObservedCell({ readsAllSitesOnce: true })))
    .groupBy(operators.countryCode);
}

export function selectMonthTotals(months: readonly string[]) {
  const [oldestMonth] = months;
  return db
    .select({
      countryCode: contributorMonths.countryCode,
      month: contributorMonths.month,
      samples: sql<number>`coalesce(sum(${contributorMonths.sampleCount}), 0)`.mapWith(Number),
      people: sql<number>`count(*) FILTER (WHERE ${contributorMonths.sampleCount} > 0)`.mapWith(Number),
    })
    .from(contributorMonths)
    .where(oldestMonth === undefined ? undefined : gte(contributorMonths.month, oldestMonth))
    .groupBy(contributorMonths.countryCode, contributorMonths.month);
}

async function computeObservationStatistics(): Promise<ObservationStatistics[]> {
  const months = lastMonths(new Date());
  const [siteRows, cellRows, squareRows, monthRows] = await Promise.all([
    selectPublicSiteTotals(),
    selectPublicCellTotals(),
    loadSquares(),
    selectMonthTotals(months),
  ]);

  const statistics = new Map<string, ObservationStatistics>();
  const countryOf = (countryCode: string) => {
    const existing = statistics.get(countryCode);
    if (existing !== undefined) return existing;
    const created = emptyObservationStatistics(countryCode, months);
    statistics.set(countryCode, created);
    return created;
  };

  for (const { countryCode, status, sites } of siteRows) {
    if (countryCode === null) continue;
    if (status === "unmatched" || status === "suggested" || status === "matched") countryOf(countryCode).sites[status] = sites;
  }
  for (const row of cellRows) {
    const country = countryOf(row.countryCode);
    country.observedCells = row.cells;
    country.lastMeasuredOn = row.lastMeasuredOn;
  }
  const parentsByCountry = Map.groupBy(squareRows, (row) => row.countryCode);
  for (const [countryCode, parents] of parentsByCountry) {
    const country = countryOf(countryCode);
    country.squares = parents.reduce((total, row) => total + row.squares, 0);
    country.areaSquareKilometers = Math.round(areaOfSquaresKm2(parents) * 10) / 10;
  }
  for (const row of monthRows) {
    const country = countryOf(row.countryCode);
    const index = months.indexOf(row.month);
    if (index >= 0) country.months[index] = shownMonth(row.month, row.samples, row.people);
  }
  return [...statistics.values()];
}

export async function loadObservationStatistics(): Promise<ObservationStatistics[]> {
  if (!redis.isReady) return computeObservationStatistics();

  const { value } = await withRedisStaleCache(OBSERVATION_STATISTICS_KEY, OBSERVATION_STATISTICS_CACHE, computeObservationStatistics);
  return value;
}
