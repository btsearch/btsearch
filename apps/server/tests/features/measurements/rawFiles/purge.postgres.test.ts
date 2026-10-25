/* oxlint-disable no-await-in-loop */
import { crowdSettings, devices, uploads } from "@openbts/drizzle";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

import { forgetContributorMeasurements } from "../../../../src/features/measurements/contributors/accountDeletion.js";
import { purgeRawFiles, sweepOrphanFiles } from "../../../../src/features/measurements/rawFiles/purge.js";
import { rawStoreFor, uploadFilePath } from "../../../../src/features/measurements/rawFiles/store.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { insertDevice, insertFold, insertPerson, insertUpload } from "../../../helpers/measurementFixtures.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 365;
const pastRetention = new Date(Date.now() - (RETENTION_DAYS + 35) * DAY_MS);
const subtractedAt = new Date("2026-10-21T00:00:00Z");

beforeEach(() => {
  vi.stubEnv("OBSERVATIONS_DIR", join(tmpdir(), "crowd-purge-test"));
});

async function withFilesDeleted(tx: DbTx, uploadIds: readonly string[]): Promise<Set<string>> {
  const rows = await tx
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(inArray(uploads.id, [...uploadIds]), isNotNull(uploads.objectDeletedAt)));
  return new Set(rows.map((row) => row.id));
}

async function keepFilesForRetentionDays(tx: DbTx): Promise<void> {
  await tx.update(crowdSettings).set({ rawRetentionDays: RETENTION_DAYS }).where(eq(crowdSettings.id, 1));
}

describeOnCrowdDatabase("deleting raw files", () => {
  it("the purge keeps the file of a withdrawn or excluded upload until the engine subtracts its fold, even past the retention", () =>
    rolledBack(async (tx) => {
      await keepFilesForRetentionDays(tx);
      const { deviceId } = await insertDevice(tx, { userId: await insertPerson(tx) });
      const waitingWithdrawn = await insertUpload(tx, deviceId, { status: "withdrawn" });
      const waitingExcluded = await insertUpload(tx, deviceId, { status: "excluded", receivedAt: pastRetention });
      const subtractedWithdrawn = await insertUpload(tx, deviceId, { status: "withdrawn" });
      const subtractedExcluded = await insertUpload(tx, deviceId, { status: "excluded", receivedAt: pastRetention });
      for (const uploadId of [waitingWithdrawn, waitingExcluded]) await insertFold(tx, uploadId);
      for (const uploadId of [subtractedWithdrawn, subtractedExcluded]) await insertFold(tx, uploadId, { unfoldedAt: subtractedAt });

      await purgeRawFiles();

      const uploadIds = [waitingWithdrawn, waitingExcluded, subtractedWithdrawn, subtractedExcluded];
      expect(await withFilesDeleted(tx, uploadIds)).toEqual(new Set([subtractedWithdrawn, subtractedExcluded]));
    }));

  it("the purge deletes the files of withdrawn uploads, of rejections older than 30 days, of uploads past the retention and of deleted accounts, and lets processing finish", () =>
    rolledBack(async (tx) => {
      await keepFilesForRetentionDays(tx);
      const { deviceId } = await insertDevice(tx, { userId: await insertPerson(tx) });
      const ownerless = await insertDevice(tx, { userId: null });
      const withdrawn = await insertUpload(tx, deviceId, { status: "withdrawn" });
      const longRejected = await insertUpload(tx, deviceId, { status: "rejected", statusChangedAt: new Date(Date.now() - 31 * DAY_MS) });
      const newlyRejected = await insertUpload(tx, deviceId, { status: "rejected", statusChangedAt: new Date(Date.now() - DAY_MS) });
      const expired = await insertUpload(tx, deviceId, { receivedAt: pastRetention });
      const kept = await insertUpload(tx, deviceId);
      const processing = await insertUpload(tx, deviceId, { status: "processing", receivedAt: pastRetention });
      const ofDeletedAccount = await insertUpload(tx, ownerless.deviceId);

      await purgeRawFiles();

      const uploadIds = [withdrawn, longRejected, newlyRejected, expired, kept, processing, ofDeletedAccount];
      expect(await withFilesDeleted(tx, uploadIds)).toEqual(new Set([withdrawn, longRejected, expired, ofDeletedAccount]));
    }));

  it("deleting an account withdraws its uploads the engine has not folded, forgets its devices' labels and phone, and deletes every file", () =>
    rolledBack(async (tx) => {
      const userId = await insertPerson(tx);
      const { deviceId } = await insertDevice(tx, { userId });
      await tx
        .update(devices)
        .set({ label: "Pixel 8", phoneHmac: randomBytes(32) })
        .where(eq(devices.id, deviceId));
      const received = await insertUpload(tx, deviceId);
      const processing = await insertUpload(tx, deviceId, { status: "processing" });
      const processed = await insertUpload(tx, deviceId, { status: "processed" });
      await insertFold(tx, processed);

      await forgetContributorMeasurements(userId);

      const stored = await tx.select({ id: uploads.id, status: uploads.status }).from(uploads).where(eq(uploads.deviceId, deviceId));
      expect(new Map(stored.map((upload) => [upload.id, upload.status]))).toEqual(
        new Map([
          [received, "withdrawn"],
          [processing, "withdrawn"],
          [processed, "processed"],
        ]),
      );
      expect(await withFilesDeleted(tx, [received, processing, processed])).toEqual(new Set([received, processing, processed]));
      expect(await tx.select({ label: devices.label, phoneHmac: devices.phoneHmac }).from(devices).where(eq(devices.id, deviceId))).toEqual([
        { label: null, phoneHmac: null },
      ]);
    }));

  it("the sweep deletes a stray file whose name is no upload id, and keeps the file a row names", () =>
    rolledBack(async (tx) => {
      const directory = await mkdtemp(join(tmpdir(), "crowd-sweep-test-"));
      vi.stubEnv("OBSERVATIONS_DIR", directory);
      const { deviceId } = await insertDevice(tx, { userId: await insertPerson(tx) });
      const uploadId = await insertUpload(tx, deviceId);
      const [upload] = await tx
        .select({ id: uploads.id, receivedAt: uploads.receivedAt, bodySha256: uploads.bodySha256 })
        .from(uploads)
        .where(eq(uploads.id, uploadId));
      if (!upload) throw new Error("The upload was not added");
      const recordedPath = uploadFilePath(upload);
      const settledAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      for (const path of [recordedPath, recordedPath.replace(/[^/]+$/, "notes.txt")]) {
        await rawStoreFor("disk").create(path, Buffer.from("sealed"));
        await utimes(join(directory, path), settledAt, settledAt);
      }

      await sweepOrphanFiles();

      expect(await readdir(join(directory, dirname(recordedPath)))).toEqual([basename(recordedPath)]);
      await rm(directory, { recursive: true, force: true });
    }));
});
