import { observedCells, observedSites, uploadDrops, uploadNewSquares } from "@openbts/drizzle";
import { randomInt } from "node:crypto";
import { expect, it, vi } from "vitest";

import { findSummary } from "../../../src/features/measurements/summary.js";
import type { DbTx } from "../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../helpers/crowdDatabase.js";
import { insertDevice, insertFold, insertPerson, insertUpload } from "../../helpers/measurementFixtures.js";

vi.mock("../../../src/database/psql.js", async () => (await import("../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const TEST_NETWORK = "00101";

async function addFirstFoundCell(tx: DbTx, uploadId: string): Promise<void> {
  const nodeId = randomInt(2 ** 40);
  const [site] = await tx.insert(observedSites).values({ plmn: TEST_NETWORK, rat: "LTE", nodeId }).returning({ id: observedSites.id });
  if (!site) throw new Error("The site was not added");
  await tx.insert(observedCells).values({ plmn: TEST_NETWORK, rat: "LTE", cellKey: nodeId * 256, observedSiteId: site.id, firstUploadId: uploadId });
}

type FoldedUpload = { status: "processed" | "withdrawn" | "excluded"; receivedAt: string; unfoldedAt?: string };

async function addFoldedUpload(tx: DbTx, deviceId: string, { status, receivedAt, unfoldedAt }: FoldedUpload): Promise<void> {
  const uploadId = await insertUpload(tx, deviceId, { status, receivedAt: new Date(receivedAt) });
  await insertFold(tx, uploadId, { sampleCount: 100, unfoldedAt: unfoldedAt === undefined ? null : new Date(unfoldedAt) });
  await tx.insert(uploadDrops).values({ uploadId, reason: "poorAccuracy", sampleCount: 10 });
  await tx.insert(uploadNewSquares).values({ uploadId, countryCode: "PL", month: "2026-10-01", squareCount: 3 });
  await addFirstFoundCell(tx, uploadId);
}

describeOnCrowdDatabase("a person's measurement totals", () => {
  it("count only folded uploads that are neither withdrawn nor excluded, so a withdrawn upload stops counting before the engine subtracts it", () =>
    rolledBack(async (tx) => {
      const userId = await insertPerson(tx);
      const { deviceId } = await insertDevice(tx, { userId });
      await addFoldedUpload(tx, deviceId, { status: "withdrawn", receivedAt: "2026-10-19T10:00:00Z" });
      await addFoldedUpload(tx, deviceId, { status: "processed", receivedAt: "2026-10-20T10:00:00Z" });
      await addFoldedUpload(tx, deviceId, { status: "excluded", receivedAt: "2026-10-21T10:00:00Z", unfoldedAt: "2026-10-22T00:00:00Z" });
      await insertUpload(tx, deviceId, { status: "received", receivedAt: new Date("2026-10-23T10:00:00Z") });

      expect(await findSummary(userId)).toEqual({
        uploads: 1,
        samples: 90,
        newSquares: 3,
        discoveries: { cells: 1, sites: 1 },
        firstUploadAt: "2026-10-20T10:00:00.000Z",
        lastUploadAt: "2026-10-20T10:00:00.000Z",
        countries: [{ countryCode: "PL", samples: 0, newSquares: 3 }],
        ranks: [],
      });
    }));
});
