import {
  countries,
  locations,
  officialLocations,
  officialPermits,
  officialSites,
  officialSources,
  operators,
  regions,
  stations,
  stationsOfficialSites,
} from "@openbts/drizzle";
import type * as productionDatabase from "@openbts/drizzle/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type LinkGroupKey, type StationLinkChanges, correctStationLinks, readOfficialGroupsAfter } from "../../../../src/features/official/links.js";
import type { DbTx } from "../../../../src/types/global.js";

const DATABASE_URL = process.env.OFFICIAL_IMPORT_TEST_DATABASE_URL ?? "";
const COUNTRY_CODE = "ZY";
const SITE_CODE = "LT1";
const OTHER_SITE_CODE = "LT9";
const LATITUDE = 41.25;
const X = -31.01;
const W = -31.02;
const Z = -31.03;
const ELSEWHERE = -31.09;
const NONE = { added: [], removed: [] };

type World = { tx: DbTx; sourceId: number; regionId: number; group: LinkGroupKey; stationId: number };
type OpenedWorld = World & { otherSiteId: number };

class RolledBack extends Error {}

let database: typeof productionDatabase;

async function rolledBack(work: (tx: DbTx) => Promise<void>): Promise<void> {
  try {
    await database.db.transaction(async (tx) => {
      await work(tx);
      throw new RolledBack();
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
  }
}

async function addOurStation(
  { tx, regionId, group }: Pick<World, "tx" | "regionId" | "group">,
  siteCode: string,
  longitude: number,
): Promise<number> {
  const [location] = await tx.insert(locations).values({ region_id: regionId, longitude, latitude: LATITUDE }).returning({ id: locations.id });
  if (!location) throw new Error("Our location was not added");
  const [station] = await tx
    .insert(stations)
    .values({ station_id: siteCode, operator_id: group.operatorId, location_id: location.id })
    .returning({ id: stations.id });
  if (!station) throw new Error("Our station was not added");

  return station.id;
}

async function placeAt({ tx, sourceId, regionId }: World, longitude: number): Promise<number> {
  const [stored] = await tx
    .select({ id: officialLocations.id })
    .from(officialLocations)
    .where(sql`${officialLocations.source_id} = ${sourceId} AND ${officialLocations.longitude} = ${longitude}`);
  if (stored) return stored.id;

  const [added] = await tx
    .insert(officialLocations)
    .values({ source_id: sourceId, region_id: regionId, longitude, latitude: LATITUDE })
    .returning({ id: officialLocations.id });
  if (!added) throw new Error("The official location was not added");

  return added.id;
}

async function addSite(
  world: World,
  longitude: number,
  permitNumbers: readonly string[],
  siteCode = SITE_CODE,
  sourceRef: string | null = null,
): Promise<number> {
  const { tx, sourceId, group } = world;
  const [site] = await tx
    .insert(officialSites)
    .values({
      source_id: sourceId,
      station_id: siteCode,
      operator_id: group.operatorId,
      location_id: await placeAt(world, longitude),
      source_ref: sourceRef,
    })
    .returning({ id: officialSites.id });
  if (!site) throw new Error("The official site was not added");

  for (const permitNumber of permitNumbers) {
    // eslint-disable-next-line no-await-in-loop
    await tx.execute(sql`
      INSERT INTO ${officialPermits} (official_site_id, rat, label_mhz, label_variant, decision_number, decision_type, expiry_date)
      VALUES (${site.id}::integer, 'LTE', 800, 'commercial', ${permitNumber}::text, 'permit', '2030-01-01'::date)
    `);
  }
  return site.id;
}

async function moveSite(world: World, officialSiteId: number, longitude: number): Promise<void> {
  await world.tx
    .update(officialSites)
    .set({ location_id: await placeAt(world, longitude) })
    .where(eq(officialSites.id, officialSiteId));
}

async function openWorld(tx: DbTx): Promise<OpenedWorld> {
  await tx.insert(countries).values({ code: COUNTRY_CODE });
  const [region] = await tx
    .insert(regions)
    .values({ name: "Links test region", code: "LT", countryCode: COUNTRY_CODE, isoCode: "ZY-LT" })
    .returning({ id: regions.id });
  const [operator] = await tx
    .insert(operators)
    .values({ name: "Links Test Mobile", full_name: "Links Test Mobile S.A.", countryCode: COUNTRY_CODE })
    .returning({ id: operators.id });
  const [source] = await tx
    .insert(officialSources)
    .values({
      key: "links-test",
      countryCode: COUNTRY_CODE,
      shortName: "LINKS",
      authority: "Links test authority",
      homepageUrl: "https://authority.invalid",
      licence: "none stated",
      attribution: "Source: links test",
      isRedistributable: true,
    })
    .returning({ id: officialSources.id });
  if (!region || !operator || !source) throw new Error("The world was not added");

  const group = { operatorId: operator.id, siteId: SITE_CODE };
  const stationId = await addOurStation({ tx, regionId: region.id, group }, SITE_CODE, W);
  const world = { tx, sourceId: source.id, regionId: region.id, group, stationId };
  await addOurStation(world, OTHER_SITE_CODE, ELSEWHERE);
  const otherSiteId = await addSite(world, ELSEWHERE, ["LT/9"], OTHER_SITE_CODE);

  return { ...world, otherSiteId };
}

async function linkedSitesOf({ tx, group }: World, siteCode = SITE_CODE): Promise<number[]> {
  const linked = await tx
    .select({ officialSiteId: stationsOfficialSites.official_site_id })
    .from(stationsOfficialSites)
    .innerJoin(stations, eq(stations.id, stationsOfficialSites.station_id))
    .where(sql`${stations.station_id} = ${siteCode} AND ${stations.operator_id} = ${group.operatorId}`);
  return linked.map(({ officialSiteId }) => officialSiteId);
}

async function correctEveryGroup({ tx, sourceId }: World) {
  const groups = await tx
    .selectDistinct({ operatorId: officialSites.operator_id, siteId: officialSites.station_id })
    .from(officialSites)
    .where(eq(officialSites.source_id, sourceId));
  return correctStationLinks(tx, groups);
}

function siteIdsOf({ added, removed }: StationLinkChanges): { added: number[]; removed: number[] } {
  return { added: added.map((link) => link.officialSiteId), removed: removed.map((link) => link.officialSiteId) };
}

describe.skipIf(DATABASE_URL === "")(
  "the links to our stations on PostgreSQL (written without a database and never executed; every case is rolled back)",
  { timeout: 120_000 },
  () => {
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", DATABASE_URL);
      database = await vi.importActual<typeof productionDatabase>("@openbts/drizzle/db");

      const [contract] = await database.db.execute<{ found: string | null }>(
        sql`SELECT to_regclass('official.locations_source_lonlat_unique')::text AS found`,
      );
      if (!contract?.found) throw new Error("OFFICIAL_IMPORT_TEST_DATABASE_URL must name a database with the migrations of packages/drizzle applied");
    });

    afterAll(async () => {
      await database.sql.end();
    });

    it("links by group: a site moves without a permit change", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const moving = await addSite(world, X, ["LT/1"]);
        await addSite(world, Z, ["LT/2"], SITE_CODE, "second");
        await correctEveryGroup(world);
        expect(await linkedSitesOf(world)).toEqual([]);
        expect(await linkedSitesOf(world, OTHER_SITE_CODE)).toEqual([world.otherSiteId]);

        await moveSite(world, moving, W);
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [moving], removed: [] });
        expect(await linkedSitesOf(world)).toEqual([moving]);
        expect(await correctEveryGroup(world)).toEqual(NONE);

        await moveSite(world, moving, X);
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [], removed: [moving] });
        expect(await linkedSitesOf(world)).toEqual([]);
        expect(await correctEveryGroup(world)).toEqual(NONE);
        expect(await linkedSitesOf(world, OTHER_SITE_CODE)).toEqual([world.otherSiteId]);
      }));

    it("links by group: a second site with the same pair appears and takes away the first one's fallback link", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const first = await addSite(world, X, ["LT/1", "LT/2"]);
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [first], removed: [] });
        expect(await linkedSitesOf(world, OTHER_SITE_CODE)).toEqual([]);
        expect(siteIdsOf(await correctEveryGroup(world))).toEqual({ added: [world.otherSiteId], removed: [] });

        await addSite(world, Z, ["LT/3"], SITE_CODE, "second");
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [], removed: [first] });
        expect(await linkedSitesOf(world)).toEqual([]);
        expect(await correctEveryGroup(world)).toEqual(NONE);
        expect(await linkedSitesOf(world, OTHER_SITE_CODE)).toEqual([world.otherSiteId]);
      }));

    it("links by group: the second site disappears and gives the fallback link back", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const first = await addSite(world, X, ["LT/1", "LT/2"]);
        const second = await addSite(world, Z, ["LT/3"], SITE_CODE, "second");
        await correctEveryGroup(world);
        expect(await linkedSitesOf(world)).toEqual([]);

        await tx.delete(officialPermits).where(eq(officialPermits.official_site_id, second));
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [first], removed: [] });
        expect(await linkedSitesOf(world)).toEqual([first]);
        expect(await correctEveryGroup(world)).toEqual(NONE);

        await tx.delete(officialSites).where(eq(officialSites.id, second));
        expect(await correctStationLinks(tx, [world.group])).toEqual(NONE);
        expect(await correctEveryGroup(world)).toEqual(NONE);
      }));

    it("moves the link to a site that appears at our station, and back when that site loses its permits", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const first = await addSite(world, X, ["LT/1"]);
        await correctStationLinks(tx, [world.group]);
        expect(await linkedSitesOf(world)).toEqual([first]);

        const atTheStation = await addSite(world, W, ["LT/2"], SITE_CODE, "second");
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [atTheStation], removed: [first] });
        expect(await linkedSitesOf(world)).toEqual([atTheStation]);

        await tx.delete(officialPermits).where(eq(officialPermits.official_site_id, atTheStation));
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [first], removed: [atTheStation] });
        expect(await linkedSitesOf(world)).toEqual([first]);
        expect(await correctStationLinks(tx, [world.group])).toEqual(NONE);
      }));

    it("removes the link to a site that has left our station's group", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const site = await addSite(world, X, ["LT/1"]);
        await correctStationLinks(tx, [world.group]);
        expect(await linkedSitesOf(world)).toEqual([site]);

        await tx.update(officialSites).set({ station_id: "LT7" }).where(eq(officialSites.id, site));
        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [], removed: [site] });
        expect(await linkedSitesOf(world)).toEqual([]);
      }));

    it("links our station whatever its status", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        await tx.update(stations).set({ status: "inactive" }).where(eq(stations.id, world.stationId));
        const site = await addSite(world, X, ["LT/1"]);

        expect(siteIdsOf(await correctStationLinks(tx, [world.group]))).toEqual({ added: [site], removed: [] });
      }));

    it("pages the groups of the official sites after a given one, and corrects without row locks when told to", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const site = await addSite(world, X, ["LT/1"]);

        const [next] = await readOfficialGroupsAfter(tx, { siteId: SITE_CODE, operatorId: world.group.operatorId - 1 });
        expect(next).toEqual({ siteId: SITE_CODE, operatorId: world.group.operatorId });

        expect(siteIdsOf(await correctStationLinks(tx, [world.group], { locksStations: false }))).toEqual({ added: [site], removed: [] });
        expect(await correctStationLinks(tx, [world.group])).toEqual(NONE);
      }));
  },
);
