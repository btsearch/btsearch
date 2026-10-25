/* oxlint-disable no-await-in-loop */
import {
  appSigningKeys,
  cellContributors,
  cellCopies,
  cellNetworks,
  contributorBlocks,
  contributors,
  countries,
  crowdSettings,
  deviceAttestations,
  deviceAttestedSignatures,
  deviceModels,
  deviceRevocations,
  devices,
  groupEstimates,
  locations,
  observedCellSummaries,
  observedCells,
  observedSites,
  operatorLinks,
  siteConfirmations,
  siteEstimates,
  siteGroups,
  siteIgnores,
  siteLinks,
  siteReplacements,
  snapTests,
  users,
  vouches,
} from "@openbts/drizzle";
import { observedSiteListQuerySchema } from "@openbts/shared/contract";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";

import { type ActorAccess, coversTarget } from "../../../../src/features/access/access.js";
import { isPublicObservedCell } from "../../../../src/features/observed/cells/visibility.js";
import { resolveObservedCellFilters } from "../../../../src/features/observed/filters.js";
import { type SiteAudience, listObservedSites } from "../../../../src/features/observed/sites/list.js";
import { type ObservedSiteRecord, loadObservedSites } from "../../../../src/features/observed/sites/read.js";
import { toObservedSite } from "../../../../src/features/observed/sites/serialize.js";
import { findSitesMeasuredBy, observedSiteIdInArea, observedSiteMeasuredBy } from "../../../../src/features/observed/sites/visibility.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { type Place, addCountry, addOperator, addRegion, addStation, added } from "../../../helpers/crowdWorld.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QO";
const PLMN = "99971";
const GUEST_PLMN = "99972";
const PLMN_THREE_DIGITS = "999071";
const GUEST_PLMN_THREE_DIGITS = "999072";
const OTHER_PLMN = "99973";
const SHARED_NETWORK_MNC = 99974;
const INSIDE: Place = [-31.1, 41.2];
const ELSEWHERE: Place = [-35, 41.2];
const BOX = "-31.3,41.0,-30.9,41.4";
const BOX_ELSEWHERE = "-35.1,41.1,-34.9,41.3";
const ADMIN: ActorAccess = { userId: "admin", role: "admin", grants: [] };
const STAFF: SiteAudience = { kind: "staff", access: ADMIN };
const PUBLIC: SiteAudience = { kind: "public" };
const SHUT_COUNTRY_CODE = "QW";
const SHUT_PLMN = "99876";
const APP_PACKAGE = "pl.btsearch.sites.test";

type Attestation = "strong" | "rooted";
type World = { tx: DbTx; regionId: number; operatorId: number; guestOperatorId: number; deviceModelId: number; nextKey: { value: number } };
type EstimateOptions = {
  at?: Place;
  uncertaintyM?: number;
  alternative?: Place;
  isConsistent?: boolean;
  personCount?: number;
  maxDistanceM?: number;
};

function regionEditor(regionId: number): ActorAccess {
  return {
    userId: "editor",
    role: "editor",
    grants: [{ countryCode: COUNTRY_CODE, isCountryWide: false, isMaintainer: false, regionIds: [regionId] }],
  };
}

function countryEditor(): ActorAccess {
  return { userId: "editor", role: "editor", grants: [{ countryCode: COUNTRY_CODE, isCountryWide: true, isMaintainer: false, regionIds: [] }] };
}

async function openWorld(tx: DbTx): Promise<World> {
  await addCountry(tx, COUNTRY_CODE);
  const regionId = await addRegion(tx, COUNTRY_CODE, [-31.2, 41.1, -31.0, 41.3]);
  const deviceModel = added(
    await tx
      .insert(deviceModels)
      .values({ manufacturer: "Sites test", model: randomUUID().slice(0, 12) })
      .returning({ id: deviceModels.id }),
    "The device model",
  );
  await tx.update(crowdSettings).set({ publishedAlgorithmVersion: 1, publicRadiusMaxM: 1000 }).where(eq(crowdSettings.id, 1));

  return {
    tx,
    regionId,
    operatorId: await addOperator(tx, COUNTRY_CODE, Number(PLMN)),
    guestOperatorId: await addOperator(tx, COUNTRY_CODE, Number(GUEST_PLMN)),
    deviceModelId: deviceModel.id,
    nextKey: { value: 1 },
  };
}

async function addSite(world: World, nodeId: number, plmn = PLMN): Promise<number> {
  return added(await world.tx.insert(observedSites).values({ plmn, rat: "LTE", nodeId }).returning({ id: observedSites.id }), "The site").id;
}

async function addCell(world: World, siteId: number, seen: [string, string] = ["2099-01-10", "2099-01-12"], plmn = PLMN): Promise<number> {
  const cellKey = world.nextKey.value++;
  const cell = added(
    await world.tx.insert(observedCells).values({ plmn, rat: "LTE", cellKey, observedSiteId: siteId }).returning({ id: observedCells.id }),
    "The cell",
  );
  await world.tx
    .insert(observedCellSummaries)
    .values({ observedCellId: cell.id, sampleCount: 50, contributorCount: 1, personCount: 1, firstSeenOn: seen[0], lastSeenOn: seen[1] });
  return cell.id;
}

const ESTIMATE = {
  ellipseMajorM: 240,
  ellipseMinorM: 150,
  ellipseAzimuthDeg: 35,
  sampleCount: 1000,
  contributorCount: 3,
  binCount: 60,
  taSampleCount: 400,
  angularCoverageDeg: 230,
  distinctDays: 6,
  maxDistanceM: 3500,
};

function pointAt([longitude, latitude]: Place) {
  return sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
}

function estimateValues({
  at = INSIDE,
  uncertaintyM = 200,
  alternative,
  isConsistent = true,
  personCount = 2,
  maxDistanceM = ESTIMATE.maxDistanceM,
}: EstimateOptions) {
  return {
    ...ESTIMATE,
    maxDistanceM,
    algorithmVersion: 1,
    point: pointAt(at),
    alternativePoint: alternative === undefined ? null : pointAt(alternative),
    uncertaintyM,
    isConsistent,
    personCount,
  };
}

async function estimate(world: World, siteId: number, options: EstimateOptions = {}): Promise<void> {
  await world.tx
    .insert(siteEstimates)
    .values({ ...estimateValues(options), observedSiteId: siteId, evidenceClass: "coarseTaPeople", ellipseScale: 1.5 });
}

async function group(world: World, memberIds: readonly number[], options: EstimateOptions = {}): Promise<number> {
  const leadSiteId = Math.min(...memberIds);
  await world.tx.insert(siteGroups).values(memberIds.map((observedSiteId) => ({ observedSiteId, algorithmVersion: 1, leadSiteId })));
  await world.tx.insert(groupEstimates).values({ ...estimateValues(options), leadSiteId });
  return leadSiteId;
}

async function addPlacedStation(world: World, at: Place): Promise<number> {
  return addStation(world.tx, { operatorId: world.operatorId, regionId: world.regionId, at });
}

async function addLocation(world: World, [longitude, latitude]: Place): Promise<number> {
  const location = added(
    await world.tx.insert(locations).values({ region_id: world.regionId, longitude, latitude }).returning({ id: locations.id }),
    "The location",
  );
  return location.id;
}

async function addContributor(world: World, confirmsAlone?: boolean): Promise<string> {
  const user = added(
    await world.tx
      .insert(users)
      .values({ email: `${randomUUID()}@sites.invalid`, name: "Sites test" })
      .returning({ id: users.id }),
    "The person",
  );
  await world.tx.insert(contributors).values({ userId: user.id });
  if (confirmsAlone !== undefined) await world.tx.insert(vouches).values({ userId: user.id, weight: 1, confirmsAlone, reason: "Known to us" });
  return user.id;
}

async function addDevice(world: World, userId: string, attestation?: Attestation): Promise<string> {
  const device = added(
    await world.tx
      .insert(devices)
      .values({ userId, modelId: world.deviceModelId, publicKey: randomBytes(65) })
      .returning({ id: devices.id }),
    "The device",
  );
  if (attestation === undefined) return device.id;

  const digest = randomBytes(32);
  await world.tx.insert(appSigningKeys).values({ digest, package: APP_PACKAGE });
  await world.tx.insert(deviceAttestations).values({
    deviceId: device.id,
    root: "googleEc",
    securityLevel: "trustedEnvironment",
    keymintSecurityLevel: "trustedEnvironment",
    verifiedBootState: "verified",
    isBootloaderLocked: attestation === "strong",
    attestedPackage: APP_PACKAGE,
  });
  await world.tx.insert(deviceAttestedSignatures).values({ deviceId: device.id, digest });
  return device.id;
}

async function addPerson(world: World, confirmsAlone?: boolean): Promise<string> {
  return addDevice(world, await addContributor(world, confirmsAlone));
}

async function saw(
  world: World,
  observedCellId: number,
  deviceId: string,
  firstSeenOn: string,
  lastSeenOn = firstSeenOn,
  tripCount = 1,
): Promise<void> {
  await world.tx.insert(cellContributors).values({ observedCellId, deviceId, sampleCount: 5, tripCount, firstSeenOn, lastSeenOn });
}

async function groupOfTwo(world: World, leadNodeId: number): Promise<{ lead: number; leadCell: number; otherCell: number }> {
  const leadSite = await addSite(world, leadNodeId);
  const otherSite = await addSite(world, leadNodeId + 1);
  await estimate(world, leadSite);
  await estimate(world, otherSite);
  return {
    lead: await group(world, [leadSite, otherSite]),
    leadCell: await addCell(world, leadSite),
    otherCell: await addCell(world, otherSite),
  };
}

function withWorld(work: (world: World) => Promise<void>): Promise<void> {
  return rolledBack(async (tx) => work(await openWorld(tx)));
}

async function listed(query: Record<string, string>, audience = STAFF): Promise<{ ids: number[]; nextCursor: string | null; total?: number }> {
  const parsed = observedSiteListQuerySchema.parse(query);
  const { data, paging } = await listObservedSites(parsed, await resolveObservedCellFilters(parsed), audience);
  return { ids: data.map((site) => site.id), nextCursor: paging.nextCursor, total: paging.total };
}

function byId(ids: readonly number[]): number[] {
  return ids.toSorted((a, b) => b - a);
}

async function broadcast(world: World, siteId: number, cellPlmn: string, plmn: string, contributorBits: bigint): Promise<void> {
  const observedCellId = await addCell(world, siteId, undefined, cellPlmn);
  await world.tx
    .insert(cellNetworks)
    .values({ observedCellId, plmn, sampleCount: 9, contributorBits, firstSeenOn: "2099-01-10", lastSeenOn: "2099-01-11" });
}

async function site(siteId: number): Promise<ObservedSiteRecord> {
  const [found] = await loadObservedSites([siteId]);
  if (found === undefined) throw new Error(`Site ${siteId} was not found`);
  return found;
}

describeOnCrowdDatabase("the estimated site read", () => {
  it("answers a fit with its radius and no probability, a snap at its target with no radius, and a snap to another site at that site's own estimate", () =>
    withWorld(async (world) => {
      const fitted = await addSite(world, 100);
      await estimate(world, fitted, { uncertaintyM: 206 });
      const locationId = await addLocation(world, [-31.12, 41.22]);
      const onLocation = await addSite(world, 101);
      await estimate(world, onLocation);
      await world.tx
        .insert(snapTests)
        .values({ observedSiteId: onLocation, algorithmVersion: 1, locationId, difference: 0.2, probability: 0.8612, isSnap: true });
      const target = await addSite(world, 102);
      const targetMate = await addSite(world, 103);
      await estimate(world, target, { at: [-31.05, 41.25] });
      await estimate(world, targetMate, { at: [-31.06, 41.27] });
      await group(world, [target, targetMate], { at: [-31.055, 41.26] });
      const onSite = await addSite(world, 104);
      await estimate(world, onSite);
      await world.tx
        .insert(snapTests)
        .values({ observedSiteId: onSite, algorithmVersion: 1, otherSiteId: target, difference: 0.1, probability: 0.7, isSnap: true });

      const fit = toObservedSite(await site(fitted));
      expect(fit.placement).toEqual({
        kind: "fit",
        radiusMeters: 206,
        confidence: 0.95,
        ellipse: { majorMeters: 240, minorMeters: 150, azimuthDegrees: 35 },
        alternative: null,
      });
      expect(toObservedSite(await site(onLocation))).toMatchObject({
        latitude: 41.22,
        longitude: -31.12,
        placement: { kind: "location", locationId, probability: 0.861 },
      });
      expect(toObservedSite(await site(onSite))).toMatchObject({
        latitude: 41.25,
        longitude: -31.05,
        placement: { kind: "observedSite", observedSiteId: target },
      });
    }));

  it("answers a group's member with the group's estimate and status and its own identity, and a matched member on its own", () =>
    withWorld(async (world) => {
      const [lead, member, matched] = [await addSite(world, 200), await addSite(world, 201), await addSite(world, 202)];
      for (const id of [lead, member, matched]) await estimate(world, id);
      await addCell(world, member, ["2099-01-03", "2099-01-09"]);
      await group(world, [lead, member, matched], { at: [-31.15, 41.15], personCount: 7 });
      const suggested = await addPlacedStation(world, [-31.15, 41.15]);
      const station = await addPlacedStation(world, [-31.15, 41.151]);
      await world.tx.insert(siteLinks).values([
        { observedSiteId: member, stationId: suggested, kind: "suggested" },
        { observedSiteId: matched, stationId: station, kind: "matched" },
      ]);

      const memberRecord = await site(member);
      expect(memberRecord.group).toEqual({ leadSiteId: lead, memberSiteIds: [lead, member, matched] });
      expect(toObservedSite(memberRecord)).toMatchObject({
        enbid: 201,
        groupId: lead,
        latitude: 41.15,
        evidence: { people: 7 },
        status: "matched",
        matchedStationId: station,
        handLink: null,
        firstSeenOn: "2099-01-03",
        lastSeenOn: "2099-01-09",
      });
      expect(toObservedSite(await site(matched))).toMatchObject({ enbid: 202, groupId: null, latitude: 41.2, status: "matched" });
    }));

  it("confirms a group whose members two people saw on two days, not one that one person saw for weeks, and one that a vouched person saw alone", () =>
    withWorld(async (world) => {
      const [alice, bob, vouchedPerson] = [await addPerson(world), await addPerson(world), await addPerson(world, true)];

      const twoPeople = await groupOfTwo(world, 300);
      await saw(world, twoPeople.leadCell, alice, "2099-01-10");
      await saw(world, twoPeople.otherCell, bob, "2099-01-11");
      const onePerson = await groupOfTwo(world, 310);
      await saw(world, onePerson.leadCell, alice, "2099-01-01", "2099-01-20");
      await saw(world, onePerson.otherCell, alice, "2099-01-05", "2099-01-25");
      const vouched = await groupOfTwo(world, 320);
      await saw(world, vouched.leadCell, vouchedPerson, "2099-01-10");

      expect((await site(twoPeople.lead)).isConfirmed).toBe(true);
      expect((await site(onePerson.lead)).isConfirmed).toBe(false);
      expect((await site(vouched.lead)).isConfirmed).toBe(true);
    }));

  it("counts no revoked device and no blocked person, under the rule of two people or of a vouch", () =>
    withWorld(async (world) => {
      const alice = await addPerson(world);
      const blockedPerson = await addContributor(world);
      await world.tx.insert(contributorBlocks).values({ userId: blockedPerson, reason: "A test block" });
      const vouchedPerson = await addContributor(world, true);
      const revokedPhone = await addDevice(world, vouchedPerson);
      await world.tx.insert(deviceRevocations).values({ deviceId: revokedPhone });

      const withBlockedSecond = await groupOfTwo(world, 330);
      await saw(world, withBlockedSecond.leadCell, alice, "2099-01-10");
      await saw(world, withBlockedSecond.otherCell, await addDevice(world, blockedPerson), "2099-01-11");
      const vouchedOnRevoked = await groupOfTwo(world, 340);
      await saw(world, vouchedOnRevoked.leadCell, revokedPhone, "2099-01-10");
      const vouchedOnAnother = await groupOfTwo(world, 350);
      await saw(world, vouchedOnAnother.leadCell, revokedPhone, "2099-01-10");
      await saw(world, vouchedOnAnother.otherCell, await addDevice(world, vouchedPerson), "2099-01-10");

      expect((await site(withBlockedSecond.lead)).isConfirmed).toBe(false);
      expect((await site(vouchedOnRevoked.lead)).isConfirmed).toBe(false);
      expect((await site(vouchedOnAnother.lead)).isConfirmed).toBe(true);
    }));

  it("confirms a group whose cell one person's strong phone saw on two trips, not on one trip, by a rooted phone, by two phones or by a revoked or blocked one", () =>
    withWorld(async (world) => {
      const sawOnTrips = async (leadNodeId: number, deviceIds: readonly string[], tripCount: number) => {
        const sighted = await groupOfTwo(world, leadNodeId);
        for (const deviceId of deviceIds) await saw(world, sighted.leadCell, deviceId, "2099-01-10", "2099-01-10", tripCount);
        return sighted.lead;
      };
      const strongPhoneOf = async () => addDevice(world, await addContributor(world), "strong");
      const twoPhonesOwner = await addContributor(world);
      const revokedPhone = await strongPhoneOf();
      await world.tx.insert(deviceRevocations).values({ deviceId: revokedPhone });
      const blockedPerson = await addContributor(world);
      await world.tx.insert(contributorBlocks).values({ userId: blockedPerson, reason: "A test block" });

      const cases = {
        twoTrips: await sawOnTrips(1600, [await strongPhoneOf()], 2),
        oneTrip: await sawOnTrips(1610, [await strongPhoneOf()], 1),
        rootedPhone: await sawOnTrips(1620, [await addDevice(world, await addContributor(world), "rooted")], 2),
        twoPhones: await sawOnTrips(1630, [await addDevice(world, twoPhonesOwner, "strong"), await addDevice(world, twoPhonesOwner, "strong")], 1),
        revokedPhone: await sawOnTrips(1640, [revokedPhone], 2),
        blockedPerson: await sawOnTrips(1650, [await addDevice(world, blockedPerson, "strong")], 2),
      };

      const answers = await loadObservedSites(Object.values(cases));
      const isConfirmed = Object.fromEntries(
        Object.entries(cases).map(([name, id]) => [name, answers.find((answer) => answer.id === id)?.isConfirmed]),
      );
      expect(isConfirmed).toEqual({
        twoTrips: true,
        oneTrip: false,
        rootedPhone: false,
        twoPhones: false,
        revokedPhone: false,
        blockedPerson: false,
      });
    }));

  it("answers ignored, a copy as its primary, a retired site as replaced and a site without an estimate without a position", () =>
    withWorld(async (world) => {
      const ignored = await addSite(world, 400);
      await estimate(world, ignored);
      await world.tx.insert(siteIgnores).values({ observedSiteId: ignored, reason: "A test mast", observedCellIds: [await addCell(world, ignored)] });

      const primary = await addSite(world, 410);
      await estimate(world, primary, { at: [-31.11, 41.21] });
      const primaryCell = await addCell(world, primary);
      const suggested = await addPlacedStation(world, [-31.11, 41.21]);
      await world.tx.insert(siteLinks).values({ observedSiteId: primary, stationId: suggested, kind: "suggested" });
      const copy = await addSite(world, 410, GUEST_PLMN);
      await world.tx
        .insert(cellCopies)
        .values({ observedCellId: await addCell(world, copy, undefined, GUEST_PLMN), primaryCellId: primaryCell, basis: "broadcastList" });

      const retired = await addSite(world, 420);
      await estimate(world, retired, { at: [-31.12, 41.22] });
      const [successor, otherSuccessor] = [await addSite(world, 421), await addSite(world, 422)];
      await world.tx.update(observedSites).set({ retiredAt: new Date() }).where(eq(observedSites.id, retired));
      await world.tx.insert(siteReplacements).values([
        { observedSiteId: retired, replacedBySiteId: otherSuccessor },
        { observedSiteId: retired, replacedBySiteId: successor },
      ]);

      expect(toObservedSite(await site(ignored))).toMatchObject({ status: "ignored", ignore: { reason: "A test mast", by: null }, handLink: null });
      expect(toObservedSite(await site(copy))).toMatchObject({
        plmns: [GUEST_PLMN],
        copyOfObservedSiteId: primary,
        latitude: 41.21,
        status: "suggested",
        suggestedStationId: suggested,
      });
      expect(toObservedSite(await site(retired))).toMatchObject({
        status: "replaced",
        latitude: 41.22,
        replacedByObservedSiteIds: [successor, otherSuccessor],
        isPublic: false,
        notPublicReasons: expect.arrayContaining(["replaced"]),
      });
      expect(toObservedSite(await site(successor))).toMatchObject({
        latitude: null,
        longitude: null,
        placement: null,
        evidence: null,
        estimatedAt: null,
        notPublicReasons: ["notEstimated", "unconfirmed"],
      });
    }));

  it("counts a point outside every outline in its network's operator's country, for an editor of that country and not of a region", () =>
    withWorld(async (world) => {
      const inside = await addSite(world, 500);
      await estimate(world, inside);
      const outside = await addSite(world, 501);
      await estimate(world, outside, { at: ELSEWHERE });

      const [insideRecord, outsideRecord] = [await site(inside), await site(outside)];
      expect(insideRecord).toMatchObject({ countryCode: COUNTRY_CODE, regionId: world.regionId });
      expect(outsideRecord).toMatchObject({ countryCode: COUNTRY_CODE, regionId: null });
      expect([
        coversTarget(regionEditor(world.regionId), insideRecord),
        coversTarget(regionEditor(world.regionId), outsideRecord),
        coversTarget(countryEditor(), outsideRecord),
      ]).toEqual([true, false, true]);
    }));

  it("gives a site snapped to a location the region that location is filed under, and one snapped to another site that site's region", () =>
    withWorld(async (world) => {
      const locationId = await addLocation(world, ELSEWHERE);
      const onLocation = await addSite(world, 510);
      await estimate(world, onLocation, { at: ELSEWHERE });
      await world.tx
        .insert(snapTests)
        .values({ observedSiteId: onLocation, algorithmVersion: 1, locationId, difference: 0.1, probability: 0.9, isSnap: true });
      const outside = await addSite(world, 511);
      await estimate(world, outside, { at: ELSEWHERE });
      const onOutside = await addSite(world, 512);
      await estimate(world, onOutside);
      await world.tx
        .insert(snapTests)
        .values({ observedSiteId: onOutside, algorithmVersion: 1, otherSiteId: outside, difference: 0.1, probability: 0.7, isSnap: true });

      expect(await site(onLocation)).toMatchObject({ regionId: world.regionId });
      expect(await site(onOutside)).toMatchObject({ regionId: null });
    }));

  it("makes a site public when it is confirmed or matched, not ignored, one point, consistent and placed closely enough", () =>
    withWorld(async (world) => {
      const confirmed = async (nodeId: number, options: EstimateOptions = {}) => {
        const id = await addSite(world, nodeId);
        await estimate(world, id, options);
        await world.tx.insert(siteConfirmations).values({ observedSiteId: id, basis: "twoPeople" });
        return id;
      };
      const matchedAt = async (nodeId: number, options: EstimateOptions = {}) => {
        const id = await addSite(world, nodeId);
        await estimate(world, id, options);
        await world.tx.insert(siteLinks).values({ observedSiteId: id, stationId: await addPlacedStation(world, INSIDE), kind: "matched" });
        return id;
      };
      const locationId = await addLocation(world, [-31.12, 41.22]);
      const snapped = async (nodeId: number, probability: number, options: EstimateOptions = {}) => {
        const id = await confirmed(nodeId, options);
        await world.tx.insert(snapTests).values({ observedSiteId: id, algorithmVersion: 1, locationId, difference: 0.2, probability, isSnap: true });
        return id;
      };
      const ignored = await confirmed(606);
      await world.tx.insert(siteIgnores).values({ observedSiteId: ignored, reason: "A test mast", observedCellIds: [await addCell(world, ignored)] });
      const unconfirmed = await addSite(world, 600);
      await estimate(world, unconfirmed);
      const cases = {
        confirmed: await confirmed(602),
        matched: await matchedAt(601),
        unconfirmed,
        ignored,
        ambiguous: await confirmed(603, { alternative: [-31.15, 41.25] }),
        inconsistent: await confirmed(604, { isConsistent: false }),
        wide: await confirmed(605, { uncertaintyM: 2500 }),
        snappedWide: await snapped(607, 0.5, { uncertaintyM: 2500 }),
        snappedUnsure: await snapped(608, 0.42),
        measuredClose: await confirmed(609, { maxDistanceM: 250 }),
        measuredCloseAndMatched: await matchedAt(610, { maxDistanceM: 250 }),
      };

      const answers = await loadObservedSites(Object.values(cases));
      const answerOf = (id: number) => answers.find((answer) => answer.id === id);
      const isPublic = Object.fromEntries(Object.entries(cases).map(([name, id]) => [name, answerOf(id)?.isPublic]));
      const reasons = Object.fromEntries(Object.entries(cases).map(([name, id]) => [name, answerOf(id)?.notPublicReasons]));
      expect(isPublic).toEqual({
        confirmed: true,
        matched: true,
        unconfirmed: false,
        ignored: false,
        ambiguous: false,
        inconsistent: false,
        wide: false,
        snappedWide: true,
        snappedUnsure: false,
        measuredClose: false,
        measuredCloseAndMatched: true,
      });
      expect(reasons).toEqual({
        confirmed: [],
        matched: [],
        unconfirmed: ["unconfirmed"],
        ignored: ["ignored"],
        ambiguous: ["looseFit"],
        inconsistent: ["looseFit"],
        wide: ["looseFit"],
        snappedWide: [],
        snappedUnsure: ["looseFit"],
        measuredClose: ["possibleSmallCell"],
        measuredCloseAndMatched: [],
      });
    }));

  it("lists a network its cells broadcast once two people read it, with its operator as a guest", () =>
    withWorld(async (world) => {
      const readByTwo = await addSite(world, 700);
      const readByOne = await addSite(world, 701);
      for (const [siteId, bits] of [
        [readByTwo, 0b11n],
        [readByOne, 0b1n],
      ] as const) {
        await world.tx.insert(cellNetworks).values({
          observedCellId: await addCell(world, siteId),
          plmn: GUEST_PLMN,
          sampleCount: 9,
          contributorBits: bits,
          firstSeenOn: "2099-01-10",
          lastSeenOn: "2099-01-11",
        });
      }

      expect(toObservedSite(await site(readByTwo))).toMatchObject({
        plmns: [PLMN, GUEST_PLMN],
        operatorId: world.operatorId,
        guestOperatorIds: [world.guestOperatorId],
      });
      expect(toObservedSite(await site(readByOne))).toMatchObject({ plmns: [PLMN], guestOperatorIds: [] });
    }));

  it("names the operator of a network read with its MNC in the other length, unless another network has that code", () =>
    withWorld(async (world) => {
      const threeDigitOperatorId = await addOperator(world.tx, COUNTRY_CODE, Number(GUEST_PLMN_THREE_DIGITS));
      const siteIds = [
        await addSite(world, 720, PLMN_THREE_DIGITS),
        await addSite(world, 721, GUEST_PLMN_THREE_DIGITS),
        await addSite(world, 722, GUEST_PLMN),
      ];

      const operatorIds = await Promise.all(siteIds.map(async (siteId) => toObservedSite(await site(siteId)).operatorId));
      expect(operatorIds).toEqual([world.operatorId, threeDigitOperatorId, world.guestOperatorId]);
    }));

  it("finds a group's members in a box by their joint fit, a copy only when asked for, and never a retired site", () =>
    withWorld(async (world) => {
      const [lead, member] = [await addSite(world, 800), await addSite(world, 801)];
      await estimate(world, lead, { at: ELSEWHERE });
      await estimate(world, member, { at: ELSEWHERE });
      await group(world, [lead, member], { at: INSIDE });
      const lone = await addSite(world, 802);
      await estimate(world, lone);
      const copy = await addSite(world, 802, GUEST_PLMN);
      await world.tx.insert(cellCopies).values({
        observedCellId: await addCell(world, copy, undefined, GUEST_PLMN),
        primaryCellId: await addCell(world, lone),
        basis: "broadcastList",
      });
      const retired = await addSite(world, 803);
      await estimate(world, retired);
      await world.tx.update(observedSites).set({ retiredAt: new Date() }).where(eq(observedSites.id, retired));

      expect((await listed({ bbox: BOX })).ids).toEqual(byId([lead, member, lone]));
      expect((await listed({ bbox: BOX_ELSEWHERE })).ids).toEqual([]);
      expect((await listed({ bbox: BOX, includeCopies: "true" })).ids).toEqual(byId([lead, member, lone, copy]));
    }));

  it("finds an operator's sites, the sites whose cells broadcast its network as two people read it, and a shared network's members' sites", () =>
    withWorld(async (world) => {
      await addOperator(world.tx, COUNTRY_CODE, Number(OTHER_PLMN));
      const sharedNetworkId = await addOperator(world.tx, COUNTRY_CODE, SHARED_NETWORK_MNC);
      await world.tx.insert(operatorLinks).values({ operatorId: world.guestOperatorId, relatedOperatorId: sharedNetworkId, kind: "jv_member" });
      const own = await addSite(world, 900);
      const readByTwo = await addSite(world, 901, OTHER_PLMN);
      const readByOne = await addSite(world, 902, OTHER_PLMN);
      const member = await addSite(world, 903, GUEST_PLMN);
      for (const id of [own, readByTwo, readByOne, member]) await estimate(world, id);
      await broadcast(world, readByTwo, OTHER_PLMN, PLMN, 0b11n);
      await broadcast(world, readByOne, OTHER_PLMN, PLMN, 0b1n);

      expect((await listed({ bbox: BOX, operatorIds: String(world.operatorId) })).ids).toEqual(byId([own, readByTwo]));
      expect((await listed({ bbox: BOX, operatorIds: String(sharedNetworkId) })).ids).toEqual([member]);
    }));

  it("leaves matched sites out of statuses=unmatched,suggested", () =>
    withWorld(async (world) => {
      const [unmatched, suggested, matched] = [await addSite(world, 1000), await addSite(world, 1001), await addSite(world, 1002)];
      for (const id of [unmatched, suggested, matched]) await estimate(world, id);
      await world.tx.insert(siteLinks).values([
        { observedSiteId: suggested, stationId: await addPlacedStation(world, INSIDE), kind: "suggested" },
        { observedSiteId: matched, stationId: await addPlacedStation(world, INSIDE), kind: "matched" },
      ]);

      expect((await listed({ bbox: BOX, statuses: "unmatched,suggested" })).ids).toEqual(byId([unmatched, suggested]));
    }));

  it("reads minPeople from the estimate shown, so a group's members count its people", () =>
    withWorld(async (world) => {
      const [lead, member] = [await addSite(world, 1100), await addSite(world, 1101)];
      await estimate(world, lead, { personCount: 1 });
      await estimate(world, member, { personCount: 1 });
      await group(world, [lead, member], { personCount: 5 });
      const lone = await addSite(world, 1102);
      await estimate(world, lone, { personCount: 2 });

      expect((await listed({ bbox: BOX, minPeople: "3" })).ids).toEqual(byId([lead, member]));
    }));

  it("finds by lastSeenAfter the sites with a cell seen on or after that day", () =>
    withWorld(async (world) => {
      const recent = await addSite(world, 1200);
      const earlier = await addSite(world, 1201);
      for (const id of [recent, earlier]) await estimate(world, id);
      await addCell(world, recent, ["2099-01-01", "2099-01-12"]);
      await addCell(world, earlier, ["2099-01-01", "2099-01-09"]);

      expect((await listed({ bbox: BOX, lastSeenAfter: "2099-01-12" })).ids).toEqual([recent]);
    }));

  it("counts sites, not markers, and pages through them without gaps", () =>
    withWorld(async (world) => {
      const [lead, member, lone] = [await addSite(world, 1300), await addSite(world, 1301), await addSite(world, 1302)];
      for (const id of [lead, member, lone]) await estimate(world, id);
      await group(world, [lead, member]);

      const first = await listed({ bbox: BOX, limit: "2", includeTotal: "true" });
      if (first.nextCursor === null) throw new Error("The first page has no cursor");
      const second = await listed({ bbox: BOX, limit: "2", includeTotal: "true", cursor: first.nextCursor });

      expect([first.total, second.total]).toEqual([3, 3]);
      expect([...first.ids, ...second.ids]).toEqual(byId([lead, member, lone]));
      expect(second.nextCursor).toBeNull();
    }));

  it("gives an editor the cells of the sites inside their grants, and not those of sites outside them", () =>
    withWorld(async (world) => {
      const inside = await addSite(world, 1400);
      const outside = await addSite(world, 1401);
      await estimate(world, inside);
      await estimate(world, outside, { at: ELSEWHERE });
      const [insideCell, outsideCell] = [await addCell(world, inside), await addCell(world, outside)];
      const { grants } = regionEditor(world.regionId);

      const visible = await world.tx
        .select({ id: observedCells.id })
        .from(observedCells)
        .where(and(inArray(observedCells.id, [insideCell, outsideCell]), observedSiteIdInArea(grants, observedCells.observedSiteId)));
      expect(visible).toEqual([{ id: insideCell }]);
    }));

  it("lists to an editor the sites inside their grants, and to an administrator every site", () =>
    withWorld(async (world) => {
      const inside = await addSite(world, 1500);
      const outside = await addSite(world, 1501);
      await estimate(world, inside);
      await estimate(world, outside, { at: ELSEWHERE });

      const editor: SiteAudience = { kind: "staff", access: regionEditor(world.regionId) };
      expect((await listed({ bbox: BOX }, editor)).ids).toEqual([inside]);
      expect((await listed({ bbox: BOX_ELSEWHERE }, editor)).ids).toEqual([]);
      expect((await listed({ bbox: BOX_ELSEWHERE })).ids).toEqual([outside]);
    }));

  it("lists to everyone the public sites, and to you the sites you measured that are not, a copy's primary and a whole group included", () =>
    withWorld(async (world) => {
      const alice = await addContributor(world);
      const alicePhone = await addDevice(world, alice);
      const bobPhone = await addPerson(world);

      const matched = await addSite(world, 1700);
      await estimate(world, matched);
      await world.tx.insert(siteLinks).values({ observedSiteId: matched, stationId: await addPlacedStation(world, INSIDE), kind: "matched" });
      await saw(world, await addCell(world, matched), alicePhone, "2099-01-10");
      const measured = await addSite(world, 1701);
      await estimate(world, measured);
      await saw(world, await addCell(world, measured), alicePhone, "2099-01-10");
      const primary = await addSite(world, 1702);
      await estimate(world, primary);
      const copy = await addSite(world, 1702, GUEST_PLMN);
      const copyCell = await addCell(world, copy, undefined, GUEST_PLMN);
      await world.tx.insert(cellCopies).values({ observedCellId: copyCell, primaryCellId: await addCell(world, primary), basis: "broadcastList" });
      await saw(world, copyCell, alicePhone, "2099-01-10");
      const grouped = await groupOfTwo(world, 1710);
      await saw(world, grouped.otherCell, alicePhone, "2099-01-10");
      const bobs = await addSite(world, 1720);
      await estimate(world, bobs);
      await saw(world, await addCell(world, bobs), bobPhone, "2099-01-10");
      const groupedSites = await loadObservedSites([grouped.lead]);

      expect((await listed({ bbox: BOX }, PUBLIC)).ids).toEqual([matched]);
      expect((await listed({ bbox: BOX }, { kind: "mine", userId: alice })).ids).toEqual(
        byId([measured, primary, ...(groupedSites[0]?.group?.memberSiteIds ?? [])]),
      );
      const candidates = await Promise.all([measured, primary, grouped.lead, bobs].map(site));
      expect(await findSitesMeasuredBy(alice, candidates)).toEqual(new Set([measured, primary, grouped.lead]));
    }));

  it("shows nothing of a site while its country or its network's country does not publish observations, not even to the people who measured it", () =>
    withWorld(async (world) => {
      await addCountry(world.tx, SHUT_COUNTRY_CODE, { observationsPublic: false });
      await addOperator(world.tx, SHUT_COUNTRY_CODE, Number(SHUT_PLMN));
      const alice = await addContributor(world);
      const alicePhone = await addDevice(world, alice);
      const matchedAt = async (nodeId: number, plmn = PLMN) => {
        const id = await addSite(world, nodeId, plmn);
        await estimate(world, id);
        await world.tx.insert(siteLinks).values({ observedSiteId: id, stationId: await addPlacedStation(world, INSIDE), kind: "matched" });
        await saw(world, await addCell(world, id, undefined, plmn), alicePhone, "2099-01-10");
        return id;
      };
      const foreignNetwork = await matchedAt(1800, SHUT_PLMN);
      const home = await matchedAt(1801);

      expect((await site(foreignNetwork)).notPublicReasons).toEqual(["privateCountry"]);
      expect((await listed({ bbox: BOX }, PUBLIC)).ids).toEqual([home]);
      expect((await listed({ bbox: BOX }, { kind: "mine", userId: alice })).ids).toEqual([]);

      await world.tx.update(countries).set({ observationsPublic: false }).where(eq(countries.code, COUNTRY_CODE));
      expect((await site(home)).isPublic).toBe(false);
      expect((await listed({ bbox: BOX }, PUBLIC)).ids).toEqual([]);
      expect((await listed({ bbox: BOX }, { kind: "mine", userId: alice })).ids).toEqual([]);
    }));

  it("lets everyone see the cells of public sites, and you the cells of the sites you measured", () =>
    withWorld(async (world) => {
      const alice = await addContributor(world);
      const alicePhone = await addDevice(world, alice);
      const confirmed = await addSite(world, 1900);
      await estimate(world, confirmed);
      await world.tx.insert(siteConfirmations).values({ observedSiteId: confirmed, basis: "twoPeople" });
      const unconfirmed = await addSite(world, 1901);
      await estimate(world, unconfirmed);
      const publicCell = await addCell(world, confirmed);
      const [measuredCell, otherCell] = [await addCell(world, unconfirmed), await addCell(world, unconfirmed)];
      await saw(world, measuredCell, alicePhone, "2099-01-10");
      const cellIds = [publicCell, measuredCell, otherCell];

      const shown = await world.tx
        .select({ id: observedCells.id })
        .from(observedCells)
        .where(and(inArray(observedCells.id, cellIds), isPublicObservedCell()));
      const ownSites = await world.tx
        .select({ id: observedCells.id })
        .from(observedCells)
        .where(and(inArray(observedCells.id, cellIds), observedSiteMeasuredBy(alice, observedCells.observedSiteId)))
        .orderBy(observedCells.id);
      expect(shown).toEqual([{ id: publicCell }]);
      expect(ownSites).toEqual([{ id: measuredCell }, { id: otherCell }]);
    }));
});
