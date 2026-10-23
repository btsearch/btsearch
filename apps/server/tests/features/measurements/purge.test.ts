import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { purgeRawFiles, sweepOrphanFiles } from "../../../src/features/measurements/purge.js";
import { rawFilePath, rawStoreFor } from "../../../src/features/measurements/rawStore.js";
import { forgetContributorMeasurements } from "../../../src/features/measurements/withdrawals.js";
import { dbMock } from "../../helpers/boundaries.js";
import { crowdSettingsRow } from "../../helpers/measurementFixtures.js";

const today = new Date();
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
let directory: string;

function storedUpload(id: string) {
  const bodySha256 = createHash("sha256").update(id).digest();
  return { id, store: "disk" as const, receivedAt: today, bodySha256, path: rawFilePath(today, id, bodySha256) };
}

async function writeFile(path: string, modifiedAt = new Date()): Promise<void> {
  await rawStoreFor("disk").create(path, Buffer.from("sealed"));
  await utimes(join(directory, path), modifiedAt, modifiedAt);
}

async function filesOfToday(): Promise<string[]> {
  return (await readdir(join(directory, "raw", today.toISOString().slice(0, 10).replaceAll("-", "/")))).toSorted();
}

const first = storedUpload("01a12096-8da0-7c1d-9b2e-5f6a7b8c9d01");
const second = storedUpload("01a12096-8da0-7c1d-9b2e-5f6a7b8c9d02");

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "purge-"));
  vi.stubEnv("OBSERVATIONS_DIR", directory);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("purgeRawFiles", () => {
  it("deletes the files of the uploads that are due and marks them deleted", async () => {
    await writeFile(first.path);
    await writeFile(second.path);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("select", "uploads", [first]);
    dbMock.enqueueFor("update", "uploads", []);
    await purgeRawFiles();

    expect(await filesOfToday()).toEqual([second.path.split("/").at(-1)]);
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "uploads")).toHaveLength(1);
  });
});

describe("sweepOrphanFiles", () => {
  it("deletes settled files no row names and stale temporary files, and keeps recorded and fresh ones", async () => {
    const fresh = storedUpload("01a12096-8da0-7c1d-9b2e-5f6a7b8c9d03");
    const staleTemporary = `${rawFilePath(today, "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d04", Buffer.alloc(32)).replace(/[^/]+$/, "")}.leftover.tmp`;
    await writeFile(first.path, twoHoursAgo);
    await writeFile(second.path, twoHoursAgo);
    await writeFile(fresh.path);
    await writeFile(staleTemporary, twoHoursAgo);
    dbMock.enqueueFor("select", "uploads", [first]);
    await sweepOrphanFiles();

    expect(await filesOfToday()).toEqual([first.path, fresh.path].map((path) => path.split("/").at(-1)).toSorted());
  });
});

describe("forgetContributorMeasurements", () => {
  it("withdraws a deleted account's unprocessed uploads, forgets its devices' labels and phone, and deletes its files", async () => {
    await writeFile(first.path);
    dbMock.enqueueFor("update", "uploads", [], []);
    dbMock.enqueueFor("update", "devices", []);
    dbMock.enqueueFor("select", "uploads", [first]);
    await forgetContributorMeasurements("11111111-1111-4111-8111-111111111111");

    expect(dbMock.calls.filter((call) => call.operation === "update").map((call) => [call.table, call.values])).toEqual([
      ["uploads", { status: "withdrawn", statusChangedAt: expect.anything() }],
      ["devices", { label: null, phoneHmac: null }],
      ["uploads", { objectDeletedAt: expect.anything() }],
    ]);
    expect(await filesOfToday()).toEqual([]);
  });
});
