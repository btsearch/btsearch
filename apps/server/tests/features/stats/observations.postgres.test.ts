/* oxlint-disable no-await-in-loop */
import { cellContributors, cellCopies, groupEstimates, siteConfirmations, siteGroups } from "@openbts/drizzle";
import { sql } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { lastMonths, loadObservationCountryCodes, loadObservationStatistics } from "../../../src/features/stats/observations.js";
import type { DbTx } from "../../../src/types/global.js";
import { redisMock } from "../../helpers/boundaries.js";
import { describeOnCrowdDatabase, rolledBack } from "../../helpers/crowdDatabase.js";
import {
  type Place,
  addContributingPerson,
  addContributorMonth,
  addCountry,
  addLteBand,
  addLteCell,
  addObservedCell,
  addObservedSite,
  addOperator,
  addRegion,
  addStation,
  estimateSite,
  matchObservedCell,
} from "../../helpers/crowdWorld.js";
import { insertDevice } from "../../helpers/measurementFixtures.js";
import { addTrailSquare, squareAt } from "../../helpers/trailWorld.js";

vi.mock("../../../src/database/psql.js", async () => (await import("../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY = "QS";
const HIDDEN_COUNTRY = "QH";
const PRIVATE_COUNTRY = "QP";
const PLMN = "99951";
const GUEST_PLMN = "99954";
const HIDDEN_PLMN = "99952";
const PRIVATE_PLMN = "99953";
const AT: Place = [-40.1, 35.2];

type World = { tx: DbTx; operatorId: number; regionId: number; nextKey: { value: number } };

async function openWorld(tx: DbTx): Promise<World> {
  await addCountry(tx, COUNTRY);
  await addCountry(tx, HIDDEN_COUNTRY, { isVisible: false });
  await addCountry(tx, PRIVATE_COUNTRY, { observationsPublic: false });
  const operatorId = await addOperator(tx, COUNTRY, Number(PLMN));
  await addOperator(tx, COUNTRY, Number(GUEST_PLMN));
  await addOperator(tx, HIDDEN_COUNTRY, Number(HIDDEN_PLMN));
  await addOperator(tx, PRIVATE_COUNTRY, Number(PRIVATE_PLMN));
  return { tx, operatorId, regionId: await addRegion(tx, COUNTRY), nextKey: { value: 7000 } };
}

async function siteWithCell(world: World, plmn = PLMN, seen?: [string, string]): Promise<{ siteId: number; cellId: number }> {
  const key = world.nextKey.value++;
  const siteId = await addObservedSite(world.tx, plmn, key);
  await estimateSite(world.tx, siteId, AT);
  return { siteId, cellId: await addObservedCell(world.tx, { plmn, cellKey: key * 256, observedSiteId: siteId, seen }) };
}

async function confirmedSite(world: World, plmn = PLMN): Promise<{ siteId: number; cellId: number }> {
  const site = await siteWithCell(world, plmn);
  await world.tx.insert(siteConfirmations).values({ observedSiteId: site.siteId, basis: "twoPeople" });
  return site;
}

async function groupSeenByTwo(world: World): Promise<number[]> {
  const [lead, member] = [await siteWithCell(world), await siteWithCell(world)];
  await world.tx
    .insert(siteGroups)
    .values([lead, member].map(({ siteId }) => ({ observedSiteId: siteId, algorithmVersion: 1, leadSiteId: lead.siteId })));
  await world.tx.insert(groupEstimates).values({
    leadSiteId: lead.siteId,
    algorithmVersion: 1,
    point: sql`ST_SetSRID(ST_MakePoint(${AT[0]}, ${AT[1]}), 4326)`,
    uncertaintyM: 200,
    ellipseMajorM: 240,
    ellipseMinorM: 150,
    ellipseAzimuthDeg: 35,
    isConsistent: true,
    sampleCount: 1000,
    contributorCount: 2,
    personCount: 2,
    binCount: 60,
    taSampleCount: 400,
    angularCoverageDeg: 230,
    distinctDays: 2,
    maxDistanceM: 3500,
  });
  for (const [{ cellId }, day] of [
    [lead, "2099-01-10"],
    [member, "2099-01-11"],
  ] as const) {
    const { deviceId } = await insertDevice(world.tx, { userId: await addContributingPerson(world.tx) });
    await world.tx
      .insert(cellContributors)
      .values({ observedCellId: cellId, deviceId, sampleCount: 5, tripCount: 1, firstSeenOn: day, lastSeenOn: day });
  }
  return [lead.cellId, member.cellId];
}

async function statisticsOf(countryCode: string) {
  redisMock.isReady = false;
  return (await loadObservationStatistics()).find((country) => country.countryCode === countryCode);
}

function withWorld(work: (world: World) => Promise<void>): Promise<void> {
  return rolledBack(async (tx) => work(await openWorld(tx)));
}

describeOnCrowdDatabase("the measurement statistics", () => {
  it("count a public group once, no copy and no site that is not public, and the cells everyone may see, in the network's country", () =>
    withWorld(async (world) => {
      await groupSeenByTwo(world);
      const lone = await confirmedSite(world);
      const copy = await siteWithCell(world, GUEST_PLMN);
      await world.tx.insert(cellCopies).values({ observedCellId: copy.cellId, primaryCellId: lone.cellId, basis: "broadcastList" });
      await siteWithCell(world, PLMN, ["2099-01-10", "2099-03-01"]);
      await confirmedSite(world, HIDDEN_PLMN);
      const matched = await addObservedCell(world.tx, { plmn: PLMN, cellKey: 99 * 256, observedSiteId: null, seen: ["2099-01-10", "2099-02-01"] });
      const stationId = await addStation(world.tx, { operatorId: world.operatorId, regionId: world.regionId, at: AT });
      await matchObservedCell(world.tx, matched, await addLteCell(world.tx, { stationId, bandId: await addLteBand(world.tx), enbid: 99, clid: 0 }));

      expect(await statisticsOf(COUNTRY)).toMatchObject({
        sites: { unmatched: 2, suggested: 0, matched: 0 },
        observedCells: 4,
        lastMeasuredOn: "2099-02-01",
      });
      expect(await statisticsOf(HIDDEN_COUNTRY)).toBeUndefined();
    }));

  it("count a ground square once over networks and channels, and no square of a network whose measurements are not public", () =>
    withWorld(async (world) => {
      const [first, second] = [squareAt({ latitude: AT[1], longitude: AT[0] }), squareAt({ latitude: AT[1] + 0.01, longitude: AT[0] })];
      await addTrailSquare(world.tx, { plmn: PLMN, channel: 1300, bin: first, levels: { 5: 3 } });
      await addTrailSquare(world.tx, { plmn: PLMN, channel: 6300, bin: first, levels: { 4: 2 } });
      await addTrailSquare(world.tx, { plmn: GUEST_PLMN, channel: 1300, bin: first, levels: { 5: 1 } });
      await addTrailSquare(world.tx, { plmn: PLMN, channel: 1300, bin: second, levels: { 3: 1 } });
      await addTrailSquare(world.tx, { plmn: PRIVATE_PLMN, channel: 1300, bin: second, levels: { 3: 1 } });

      expect(await statisticsOf(COUNTRY)).toMatchObject({ squares: 2, areaSquareKilometers: 0 });
      expect((await statisticsOf(PRIVATE_COUNTRY))?.squares ?? 0).toBe(0);
    }));

  it("hide the numbers of a month one or two people measured", () =>
    withWorld(async (world) => {
      const months = lastMonths(new Date());
      const [thisMonth, lastMonth] = [months[11] ?? "", months[10] ?? ""];
      for (const samples of [100, 200, 300]) {
        await addContributorMonth(world.tx, { userId: await addContributingPerson(world.tx), countryCode: COUNTRY, month: thisMonth, samples });
      }
      for (const samples of [50, 60]) {
        await addContributorMonth(world.tx, { userId: await addContributingPerson(world.tx), countryCode: COUNTRY, month: lastMonth, samples });
      }

      expect((await statisticsOf(COUNTRY))?.months.slice(10)).toEqual([
        { startsOn: lastMonth, samples: null, people: null },
        { startsOn: thisMonth, samples: 600, people: 3 },
      ]);
    }));

  it("answer only countries visible to everyone whose measurements are public", () =>
    withWorld(async () => {
      expect(await loadObservationCountryCodes([COUNTRY, HIDDEN_COUNTRY, PRIVATE_COUNTRY])).toEqual([COUNTRY]);
    }));
});
