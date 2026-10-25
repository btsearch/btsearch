import {
  cellConfirmations,
  cellContributors,
  contributorBlocks,
  contributors,
  leaderboardMonths,
  observedCells,
  siteConfirmations,
  users,
} from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";

import { findRanks, loadLeaderboards, refreshLeaderboards } from "../../../src/features/stats/leaderboards.js";
import type { DbTx } from "../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../helpers/crowdDatabase.js";
import {
  type Place,
  addContributingPerson,
  addContributorMonth,
  addCountry,
  addLteBand,
  addLteCell,
  addObservedSite,
  addOperator,
  addRegion,
  addStation,
  added,
  estimateSite,
  matchObservedCell,
} from "../../helpers/crowdWorld.js";
import { insertDevice, insertFold, insertUpload } from "../../helpers/measurementFixtures.js";

vi.mock("../../../src/database/psql.js", async () => (await import("../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY = "QL";
const PLMN = "99961";
const SEPTEMBER = "2026-09-01";
const OCTOBER = "2026-10-01";
const AT: Place = [-40.1, 35.2];

type World = { tx: DbTx; operatorId: number; regionId: number; nodeId: { value: number } };
type Find = { uploadId: string; deviceId: string; siteId: number; seenOn: string };

function nameOf(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 10)}`;
}

async function openWorld(tx: DbTx): Promise<World> {
  await addCountry(tx, COUNTRY);
  return { tx, operatorId: await addOperator(tx, COUNTRY, Number(PLMN)), regionId: await addRegion(tx, COUNTRY), nodeId: { value: 4000 } };
}

async function countedUpload(world: World, deviceId: string, status: "processed" | "withdrawn" = "processed"): Promise<string> {
  const uploadId = await insertUpload(world.tx, deviceId, { status });
  await insertFold(world.tx, uploadId);
  return uploadId;
}

async function foundCell(world: World, { uploadId, deviceId, siteId, seenOn }: Find): Promise<number> {
  const cell = added(
    await world.tx
      .insert(observedCells)
      .values({ plmn: PLMN, rat: "LTE", cellKey: world.nodeId.value++ * 256, observedSiteId: siteId, firstUploadId: uploadId })
      .returning({ id: observedCells.id }),
    "The cell",
  );
  await world.tx
    .insert(cellContributors)
    .values({ observedCellId: cell.id, deviceId, sampleCount: 5, tripCount: 1, firstSeenOn: seenOn, lastSeenOn: seenOn });
  return cell.id;
}

async function addSite(world: World): Promise<number> {
  return addObservedSite(world.tx, PLMN, world.nodeId.value++);
}

async function matchToStation(world: World, observedCellId: number): Promise<void> {
  const stationId = await addStation(world.tx, { operatorId: world.operatorId, regionId: world.regionId, at: AT });
  const cellId = await addLteCell(world.tx, { stationId, bandId: await addLteBand(world.tx), enbid: world.nodeId.value++, clid: 1 });
  await matchObservedCell(world.tx, observedCellId, cellId);
}

async function storedRows(tx: DbTx) {
  return tx
    .select({
      userId: leaderboardMonths.userId,
      month: leaderboardMonths.month,
      newSquares: leaderboardMonths.newSquares,
      newConfirmedCells: leaderboardMonths.newConfirmedCells,
      newSites: leaderboardMonths.newSites,
      refreshedOn: leaderboardMonths.refreshedOn,
    })
    .from(leaderboardMonths)
    .where(eq(leaderboardMonths.countryCode, COUNTRY));
}

function withWorld(work: (world: World) => Promise<void>): Promise<void> {
  return rolledBack(async (tx) => work(await openWorld(tx)));
}

async function usernamesOn(startsOn: string | null): Promise<string[]> {
  const board = (await loadLeaderboards([COUNTRY], startsOn, 25)).get(COUNTRY);
  return board?.entries.map((entry) => entry.user.username ?? "") ?? [];
}

describeOnCrowdDatabase("the contributor leaderboards", () => {
  it("store a listed person's new squares, the confirmed public cells and the public sites they found first, in their month and country", () =>
    withWorld(async (world) => {
      const ania = await addContributingPerson(world.tx, { listedAt: new Date() });
      const unlisted = await addContributingPerson(world.tx);
      const { deviceId } = await insertDevice(world.tx, { userId: ania });
      const { deviceId: unlistedDevice } = await insertDevice(world.tx, { userId: unlisted });
      await addContributorMonth(world.tx, { userId: ania, countryCode: COUNTRY, month: OCTOBER, newSquares: 40 });
      await addContributorMonth(world.tx, { userId: ania, countryCode: COUNTRY, month: SEPTEMBER, newSquares: 0 });
      await addContributorMonth(world.tx, { userId: unlisted, countryCode: COUNTRY, month: OCTOBER, newSquares: 900 });

      const upload = await countedUpload(world, deviceId);
      const matchedSite = await addSite(world);
      const confirmedCell = await foundCell(world, { uploadId: upload, deviceId, siteId: matchedSite, seenOn: "2026-10-05" });
      await world.tx.insert(cellConfirmations).values({ observedCellId: confirmedCell, basis: "twoPeople" });
      await matchToStation(world, confirmedCell);
      const unconfirmedCell = await foundCell(world, { uploadId: upload, deviceId, siteId: matchedSite, seenOn: "2026-10-05" });
      await matchToStation(world, unconfirmedCell);

      const publicSite = await addSite(world);
      await estimateSite(world.tx, publicSite, AT);
      await world.tx.insert(siteConfirmations).values({ observedSiteId: publicSite, basis: "twoPeople" });
      await foundCell(world, { uploadId: upload, deviceId, siteId: publicSite, seenOn: "2026-09-20" });
      const hiddenSite = await addSite(world);
      await estimateSite(world.tx, hiddenSite, AT);
      await foundCell(world, { uploadId: upload, deviceId, siteId: hiddenSite, seenOn: "2026-09-20" });

      const withdrawnSite = await addSite(world);
      await estimateSite(world.tx, withdrawnSite, AT);
      await world.tx.insert(siteConfirmations).values({ observedSiteId: withdrawnSite, basis: "twoPeople" });
      await foundCell(world, { uploadId: await countedUpload(world, deviceId, "withdrawn"), deviceId, siteId: withdrawnSite, seenOn: "2026-09-21" });
      const unlistedSite = await addSite(world);
      await estimateSite(world.tx, unlistedSite, AT);
      await world.tx.insert(siteConfirmations).values({ observedSiteId: unlistedSite, basis: "twoPeople" });
      const unlistedUpload = await countedUpload(world, unlistedDevice);
      await foundCell(world, { uploadId: unlistedUpload, deviceId: unlistedDevice, siteId: unlistedSite, seenOn: "2026-09-21" });

      await refreshLeaderboards();
      const today = new Date().toISOString().slice(0, 10);
      expect((await storedRows(world.tx)).toSorted((a, b) => a.month.localeCompare(b.month))).toEqual([
        { userId: ania, month: SEPTEMBER, newSquares: 0, newConfirmedCells: 0, newSites: 1, refreshedOn: today },
        { userId: ania, month: OCTOBER, newSquares: 40, newConfirmedCells: 1, newSites: 0, refreshedOn: today },
      ]);

      await world.tx.update(contributors).set({ listedAt: null }).where(eq(contributors.userId, ania));
      await refreshLeaderboards();
      expect(await storedRows(world.tx)).toEqual([]);
    }));

  it("rank only the people shown, so an unlisted top contributor leaves no gap, and give equal numbers one rank, listed by username", () =>
    withWorld(async (world) => {
      const bartek = await addContributingPerson(world.tx, { username: nameOf("b"), listedAt: new Date() });
      const cecylia = await addContributingPerson(world.tx, { username: nameOf("c"), listedAt: new Date() });
      const ania = await addContributingPerson(world.tx, { username: nameOf("a"), listedAt: new Date() });
      const unlisted = await addContributingPerson(world.tx, { username: nameOf("u") });
      for (const [userId, september, october] of [
        [bartek, 20, 5],
        [cecylia, 20, 0],
        [ania, 10, 30],
        [unlisted, 500, 500],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop
        await addContributorMonth(world.tx, { userId, countryCode: COUNTRY, month: SEPTEMBER, newSquares: september });
        // oxlint-disable-next-line no-await-in-loop
        await addContributorMonth(world.tx, { userId, countryCode: COUNTRY, month: OCTOBER, newSquares: october });
      }
      await refreshLeaderboards();

      const september = (await loadLeaderboards([COUNTRY], SEPTEMBER, 25)).get(COUNTRY);
      const allTime = (await loadLeaderboards([COUNTRY], null, 2)).get(COUNTRY);
      expect(september?.entries.map((entry) => [entry.user.id, entry.rank, entry.newSquares])).toEqual([
        [bartek, 1, 20],
        [cecylia, 1, 20],
        [ania, 3, 10],
      ]);
      expect(allTime?.entries.map((entry) => [entry.user.id, entry.rank, entry.newSquares])).toEqual([
        [ania, 1, 40],
        [bartek, 2, 25],
      ]);
      expect(await usernamesOn(OCTOBER)).toHaveLength(2);
      expect(await findRanks(ania, [COUNTRY])).toEqual(expect.arrayContaining([{ countryCode: COUNTRY, startsOn: null, rank: 1 }]));
    }));

  it("drop a person at the next read who goes private, opts out, is blocked or banned, and bring them back when that ends, without a refresh", () =>
    withWorld(async (world) => {
      const ania = await addContributingPerson(world.tx, { username: nameOf("a"), listedAt: new Date() });
      await addContributorMonth(world.tx, { userId: ania, countryCode: COUNTRY, month: OCTOBER, newSquares: 10 });
      await refreshLeaderboards();
      const shown = async () => (await usernamesOn(OCTOBER)).length === 1;
      const listedAt = async () => {
        const [row] = await world.tx.select({ listedAt: contributors.listedAt }).from(contributors).where(eq(contributors.userId, ania));
        return row?.listedAt ?? null;
      };

      await world.tx.update(users).set({ profileVisibility: "private" }).where(eq(users.id, ania));
      const whilePrivate = await shown();
      const listedWhilePrivate = await listedAt();
      await world.tx.update(users).set({ profileVisibility: "public" }).where(eq(users.id, ania));
      const backPublic = await shown();
      await world.tx.insert(contributorBlocks).values({ userId: ania, reason: "A test block" });
      const whileBlocked = await shown();
      await world.tx
        .update(contributorBlocks)
        .set({ until: new Date(Date.now() - 60_000) })
        .where(eq(contributorBlocks.userId, ania));
      const blockEnded = await shown();
      await world.tx.update(users).set({ banned: true }).where(eq(users.id, ania));
      const whileBanned = await shown();
      await world.tx.update(users).set({ banned: false }).where(eq(users.id, ania));
      await world.tx.update(contributors).set({ listedAt: null }).where(eq(contributors.userId, ania));
      const optedOut = await shown();

      expect({ whilePrivate, backPublic, whileBlocked, blockEnded, whileBanned, optedOut }).toEqual({
        whilePrivate: false,
        backPublic: true,
        whileBlocked: false,
        blockEnded: true,
        whileBanned: false,
        optedOut: false,
      });
      expect(listedWhilePrivate).toBeInstanceOf(Date);
      expect(await listedAt()).toBeNull();
    }));
});
