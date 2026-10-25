import { contributorBlocks, contributors, deviceRevocations, deviceScores, vouches } from "@openbts/drizzle";
import type { MeasurementContributorListQuery } from "@openbts/shared/contract";
import { expect, it, vi } from "vitest";

import { findActiveBlock } from "../../../../src/features/measurements/contributors/eligibility.js";
import { countContributors, findContributors, findRankedContributorIds } from "../../../../src/features/measurements/contributors/read.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { insertDevice, insertFold, insertPerson, insertUpload } from "../../../helpers/measurementFixtures.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const EVERY_CONTRIBUTOR = 100_000;

async function addContributor(tx: DbTx): Promise<string> {
  const userId = await insertPerson(tx);
  await tx.insert(contributors).values({ userId });
  return userId;
}

async function addScoredDevice(tx: DbTx, userId: string, factor: number, foldedSamples: number | null): Promise<string> {
  const { deviceId } = await insertDevice(tx, { userId });
  await tx.insert(deviceScores).values({
    deviceId,
    scoredOn: "2026-10-24",
    readings: 1000,
    taOnConfirmed: 0,
    taWithinTolerance: 0,
    droppedImplausible: 0,
    mockReadings: 0,
    phantomCells: 0,
    factor,
  });
  if (foldedSamples === null) return deviceId;
  const uploadId = await insertUpload(tx, deviceId, { status: "processed" });
  await insertFold(tx, uploadId, { sampleCount: foldedSamples });
  return deviceId;
}

describeOnCrowdDatabase("reading contributors", () => {
  it("ranks people by the same mean computed weight their answers show: weighted by folded samples, plain without samples, 0 without devices", () =>
    rolledBack(async (tx) => {
      const withoutDevices = await addContributor(tx);
      const withSamples = await addContributor(tx);
      await addScoredDevice(tx, withSamples, 0.6, 300);
      await addScoredDevice(tx, withSamples, 1.2, 100);
      const withoutSamples = await addContributor(tx);
      await addScoredDevice(tx, withoutSamples, 0.8, null);
      const ours = new Set([withoutDevices, withSamples, withoutSamples]);

      const ranked = (await findRankedContributorIds({ sort: "weight" }, EVERY_CONTRIBUTOR, 0)).filter((userId) => ours.has(userId));
      const answers = await findContributors(ranked);

      expect(ranked).toEqual([withoutDevices, withSamples, withoutSamples]);
      expect(answers.map((contributor) => contributor.weight.computed)).toEqual([0, 0.075, 0.08]);
    }));

  it("reads a block only while it is in force, in the answer as in the upload check, with who set it and when", () =>
    rolledBack(async (tx) => {
      const admin = await insertPerson(tx);
      const [ended, openEnded, endsTomorrow] = [await addContributor(tx), await addContributor(tx), await addContributor(tx)];
      const blockedAt = new Date("2026-01-01T00:00:00Z");
      const tomorrow = new Date(Date.now() + 86_400_000);
      await tx.insert(contributorBlocks).values([
        { userId: ended, blockedAt, blockedById: admin, reason: "Ended", until: new Date("2026-02-01T00:00:00Z") },
        { userId: openEnded, blockedAt, blockedById: admin, reason: "Fake readings", until: null },
        { userId: endsTomorrow, blockedAt, blockedById: null, reason: "Mock locations", until: tomorrow },
      ]);

      const answers = await findContributors([ended, openEnded, endsTomorrow]);
      const checks = await Promise.all([ended, openEnded, endsTomorrow].map((userId) => findActiveBlock(userId)));

      expect(answers.map((contributor) => contributor.block)).toEqual([
        null,
        { reason: "Fake readings", by: expect.objectContaining({ id: admin }), at: blockedAt.toISOString(), endsAt: null },
        { reason: "Mock locations", by: null, at: blockedAt.toISOString(), endsAt: tomorrow.toISOString() },
      ]);
      expect(checks).toEqual([undefined, { until: null }, { until: tomorrow }]);
    }));

  it("filters people by a vouch or a block in force and by computed weight, and counts the people it lists", () =>
    rolledBack(async (tx) => {
      const [vouched, blocked, light, heavy] = [
        await addContributor(tx),
        await addContributor(tx),
        await addContributor(tx),
        await addContributor(tx),
      ];
      // oxlint-disable-next-line no-await-in-loop
      for (const userId of [vouched, blocked, heavy]) await addScoredDevice(tx, userId, 1.2, null);
      await addScoredDevice(tx, light, 0.6, null);
      const since = new Date("2026-01-01T00:00:00Z");
      const ended = new Date("2026-02-01T00:00:00Z");
      await tx.insert(vouches).values([
        { userId: vouched, weight: 1.5, reason: "Known surveyor", vouchedAt: since, until: null },
        { userId: heavy, weight: 1.5, reason: "Ended", vouchedAt: since, until: ended },
      ]);
      await tx.insert(contributorBlocks).values([
        { userId: blocked, blockedAt: since, reason: "Fake readings", until: null },
        { userId: heavy, blockedAt: since, reason: "Ended", until: ended },
      ]);
      const ours = new Set([vouched, blocked, light, heavy]);
      type Filters = Pick<MeasurementContributorListQuery, "isVouched" | "isBlocked" | "weightBelow">;
      const listed = async (filters: Filters) => {
        const ranked = await findRankedContributorIds({ sort: "weight", ...filters }, EVERY_CONTRIBUTOR, 0);
        expect(await countContributors(filters)).toBe(ranked.length);
        return ranked.filter((userId) => ours.has(userId)).toSorted();
      };

      expect(await listed({ isVouched: true })).toEqual([vouched]);
      expect(await listed({ isVouched: false })).toEqual([blocked, light, heavy].toSorted());
      expect(await listed({ isBlocked: true })).toEqual([blocked]);
      expect(await listed({ weightBelow: 0.1 })).toEqual([light]);
      expect(await listed({ isVouched: false, isBlocked: false, weightBelow: 0.2 })).toEqual([light, heavy].toSorted());
    }));

  it("counts a person's devices, the revoked ones apart, and every upload they sent", () =>
    rolledBack(async (tx) => {
      const userId = await addContributor(tx);
      await addScoredDevice(tx, userId, 1, 200);
      const revoked = await addScoredDevice(tx, userId, 1, 100);
      await tx.insert(deviceRevocations).values({ deviceId: revoked, reason: "Lost" });
      await insertUpload(tx, revoked, { status: "withdrawn" });

      const [contributor] = await findContributors([userId]);

      expect(contributor).toMatchObject({ deviceCount: 2, revokedDeviceCount: 1, uploadCount: 3 });
    }));

  it("reads a vouch only while it is in force, as a block", () =>
    rolledBack(async (tx) => {
      const [ended, lasting] = [await addContributor(tx), await addContributor(tx)];
      const vouchedAt = new Date("2026-01-01T00:00:00Z");
      await tx.insert(vouches).values([
        { userId: ended, weight: 1.5, reason: "Ended", vouchedAt, until: new Date("2026-02-01T00:00:00Z") },
        { userId: lasting, weight: 1.5, reason: "Known surveyor", vouchedAt, until: null },
      ]);

      const answers = await findContributors([ended, lasting]);

      expect(answers.map((contributor) => contributor.vouch?.reason ?? null)).toEqual([null, "Known surveyor"]);
    }));
});
