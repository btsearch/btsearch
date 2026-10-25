import {
  cellConfirmations,
  cellContributors,
  cellCopies,
  contributorBlocks,
  contributorMonths,
  contributors,
  devices,
  leaderboardMonths,
  observedCells,
  operators,
  uploadFolds,
  uploads,
  users,
} from "@openbts/drizzle";
import type { ContributorLeaderboard, MeasurementSummary } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, asc, eq, exists, gt, inArray, isNotNull, isNull, lte, notExists, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import db from "../../database/psql.js";
import { inForce } from "../measurements/contributors/eligibility.js";
import { isCountedUpload, isFirstCellOfItsSite } from "../measurements/uploads/counting.js";
import { isPublicObservedCell } from "../observed/cells/visibility.js";
import { selectReportedCodes } from "../observed/networks.js";
import { selectPublicSiteIds } from "../observed/sites/visibility.js";
import { toUserRef } from "../users/userRef.js";

type Board = Omit<ContributorLeaderboard, "countryCode" | "startsOn">;

function monthOf(day: SQLWrapper): SQL<string> {
  return sql<string>`date_trunc('month', ${day})::date`;
}

export function currentMonth(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function selectNewSquares() {
  return db
    .select({
      userId: contributorMonths.userId,
      countryCode: contributorMonths.countryCode,
      month: contributorMonths.month,
      newSquares: contributorMonths.newSquares,
      newConfirmedCells: sql<number>`0`.as("new_confirmed_cells"),
      newSites: sql<number>`0`.as("new_sites"),
    })
    .from(contributorMonths)
    .innerJoin(contributors, and(eq(contributors.userId, contributorMonths.userId), isNotNull(contributors.listedAt)))
    .where(gt(contributorMonths.newSquares, 0));
}

function selectFirstFinds(found: { newConfirmedCells: SQL<number>; newSites: SQL<number> }, condition: SQL | undefined) {
  const month = monthOf(cellContributors.firstSeenOn);
  const network = selectReportedCodes();
  return db
    .select({
      userId: contributors.userId,
      countryCode: operators.countryCode,
      month: month.as("month"),
      newSquares: sql<number>`0`.as("new_squares"),
      newConfirmedCells: found.newConfirmedCells.as("new_confirmed_cells"),
      newSites: found.newSites.as("new_sites"),
    })
    .from(observedCells)
    .innerJoin(uploads, eq(uploads.id, observedCells.firstUploadId))
    .innerJoin(uploadFolds, eq(uploadFolds.uploadId, uploads.id))
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .innerJoin(contributors, and(eq(contributors.userId, devices.userId), isNotNull(contributors.listedAt)))
    .innerJoin(cellContributors, and(eq(cellContributors.observedCellId, observedCells.id), eq(cellContributors.deviceId, uploads.deviceId)))
    .innerJoin(network, eq(network.reportedCode, observedCells.plmn))
    .innerJoin(operators, eq(operators.id, network.operatorId))
    .where(and(isCountedUpload(), condition))
    .groupBy(contributors.userId, operators.countryCode, month);
}

function selectNewConfirmedCells() {
  const confirmed = db
    .select({ id: cellConfirmations.observedCellId })
    .from(cellConfirmations)
    .where(eq(cellConfirmations.observedCellId, observedCells.id));
  const copy = db.select({ id: cellCopies.observedCellId }).from(cellCopies).where(eq(cellCopies.observedCellId, observedCells.id));
  return selectFirstFinds(
    { newConfirmedCells: sql<number>`count(*)::int`, newSites: sql<number>`0` },
    and(exists(confirmed), notExists(copy), isPublicObservedCell({ readsAllSitesOnce: true })),
  );
}

function selectNewSites() {
  return selectFirstFinds(
    { newConfirmedCells: sql<number>`0`, newSites: sql<number>`count(DISTINCT ${observedCells.observedSiteId})::int` },
    and(isFirstCellOfItsSite(), inArray(observedCells.observedSiteId, selectPublicSiteIds())),
  );
}

export async function refreshLeaderboards(): Promise<void> {
  const found = unionAll(selectNewSquares(), selectNewConfirmedCells(), selectNewSites()).as("found");
  await db.transaction(async (tx) => {
    await tx.delete(leaderboardMonths);
    await tx.insert(leaderboardMonths).select(
      tx
        .select({
          userId: found.userId,
          countryCode: found.countryCode,
          month: found.month,
          newSquares: sql<number>`sum(${found.newSquares})::int`.as("new_squares"),
          newConfirmedCells: sql<number>`sum(${found.newConfirmedCells})::int`.as("new_confirmed_cells"),
          newSites: sql<number>`sum(${found.newSites})::int`.as("new_sites"),
          refreshedOn: sql<string>`(now() AT TIME ZONE 'UTC')::date`.as("refreshed_on"),
        })
        .from(found)
        .groupBy(found.userId, found.countryCode, found.month),
    );
  });
}

function selectRanked(countryCodes: readonly string[], startsOn: string | null) {
  const isShown = and(
    isNotNull(contributors.listedAt),
    eq(users.profileVisibility, "public"),
    isNotNull(users.username),
    sql`${users.banned} IS NOT TRUE`,
    isNull(contributorBlocks.userId),
  );
  const total = db
    .select({
      countryCode: leaderboardMonths.countryCode,
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      newSquares: sql<number>`sum(${leaderboardMonths.newSquares})::int`.as("new_squares"),
      newConfirmedCells: sql<number>`sum(${leaderboardMonths.newConfirmedCells})::int`.as("new_confirmed_cells"),
      newSites: sql<number>`sum(${leaderboardMonths.newSites})::int`.as("new_sites"),
      refreshedOn: sql<string>`max(${leaderboardMonths.refreshedOn})`.as("refreshed_on"),
    })
    .from(leaderboardMonths)
    .innerJoin(contributors, eq(contributors.userId, leaderboardMonths.userId))
    .innerJoin(users, eq(users.id, leaderboardMonths.userId))
    .leftJoin(contributorBlocks, and(eq(contributorBlocks.userId, leaderboardMonths.userId), inForce(contributorBlocks.until)))
    .where(
      and(inArray(leaderboardMonths.countryCode, [...countryCodes]), startsOn === null ? undefined : eq(leaderboardMonths.month, startsOn), isShown),
    )
    .groupBy(leaderboardMonths.countryCode, users.id)
    .as("total");
  const order = sql`${total.newSquares} DESC, ${total.newConfirmedCells} DESC, ${total.newSites} DESC`;
  return db
    .select({
      countryCode: total.countryCode,
      id: total.id,
      username: total.username,
      name: total.name,
      image: total.image,
      newSquares: total.newSquares,
      newConfirmedCells: total.newConfirmedCells,
      newSites: total.newSites,
      refreshedOn: total.refreshedOn,
      rank: sql<number>`rank() OVER (PARTITION BY ${total.countryCode} ORDER BY ${order})::int`.as("rank"),
      position: sql<number>`row_number() OVER (PARTITION BY ${total.countryCode} ORDER BY ${order}, ${total.username})::int`.as("position"),
    })
    .from(total)
    .as("ranked");
}

export async function loadLeaderboards(countryCodes: readonly string[], startsOn: string | null, limit: number): Promise<Map<string, Board>> {
  if (countryCodes.length === 0) return new Map();

  const ranked = selectRanked(countryCodes, startsOn);
  const rows = await db.select().from(ranked).where(lte(ranked.position, limit)).orderBy(asc(ranked.countryCode), asc(ranked.position));
  const boards = new Map<string, Board>();
  for (const row of rows) {
    const board = boards.get(row.countryCode) ?? { refreshedOn: row.refreshedOn, entries: [] };
    board.entries.push({
      rank: row.rank,
      user: toUserRef(row),
      newSquares: row.newSquares,
      newConfirmedCells: row.newConfirmedCells,
      newSites: row.newSites,
    });
    boards.set(row.countryCode, board);
  }
  return boards;
}

export async function findRanks(userId: string, countryCodes: readonly string[]): Promise<MeasurementSummary["ranks"]> {
  if (countryCodes.length === 0) return [];

  const month = currentMonth();
  const ranksOn = (startsOn: string | null) => {
    const ranked = selectRanked(countryCodes, startsOn);
    return db.select({ countryCode: ranked.countryCode, rank: ranked.rank }).from(ranked).where(eq(ranked.id, userId));
  };
  const [allTime, thisMonth] = await Promise.all([ranksOn(null), ranksOn(month)]);
  const ranks = [
    ...allTime.map((row) => ({ countryCode: row.countryCode, startsOn: null, rank: row.rank })),
    ...thisMonth.map((row) => ({ countryCode: row.countryCode, startsOn: month, rank: row.rank })),
  ];
  return ranks.toSorted((a, b) => a.countryCode.localeCompare(b.countryCode) || (a.startsOn === null ? -1 : 1));
}
