import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rawFilePath, rawStoreFor } from "../../../src/features/measurements/rawStore.js";
import { openUpload, sealUpload } from "../../../src/features/measurements/seal.js";

const uploadId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";
const receivedAt = new Date("2026-10-23T12:00:00Z");
let directory: string;

function sealKey(): string {
  return randomBytes(32).toString("base64");
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "raw-store-"));
  vi.stubEnv("OBSERVATIONS_DIR", directory);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("the disk raw store", () => {
  const body = Buffer.from("the sealed body");
  const path = rawFilePath(receivedAt, uploadId, createHash("sha256").update(body).digest());

  it("names a file by its day, its upload and the start of its hash", () => {
    expect(path).toBe(`raw/2026/10/23/${uploadId}.${createHash("sha256").update(body).digest("hex").slice(0, 16)}`);
  });

  it("never overwrites a file, and says whether it wrote one", async () => {
    const store = rawStoreFor("disk");
    expect(await store.create(path, body)).toBe("written");
    expect(await store.create(path, Buffer.from("something else"))).toBe("exists");
    expect(await store.read(path)).toEqual(body);
  });

  it("lets only one of two writes racing for one name write it, and leaves no temporary file behind", async () => {
    const store = rawStoreFor("disk");
    const outcomes = await Promise.all([store.create(path, body), store.create(path, body)]);

    expect(outcomes.toSorted()).toEqual(["exists", "written"]);
    expect(await readdir(join(directory, "raw/2026/10/23"))).toEqual([path.split("/").at(-1)]);
  });
});

describe("sealing", () => {
  const body = Buffer.from("a compressed measurement batch");

  it("opens a file sealed with last year's key once a new key is first in the list", () => {
    const lastYear = sealKey();
    vi.stubEnv("OBSERVATIONS_SEAL_KEYS", `2025:${lastYear}`);
    const sealed = sealUpload(uploadId, body);

    vi.stubEnv("OBSERVATIONS_SEAL_KEYS", `2026:${sealKey()},2025:${lastYear}`);
    expect(openUpload(uploadId, sealed.bytes)).toEqual(body);
    expect(sealUpload(uploadId, body).keyId).toBe("2026");
  });

  it("does not open a file under another upload's id", () => {
    vi.stubEnv("OBSERVATIONS_SEAL_KEYS", `2026:${sealKey()}`);
    const sealed = sealUpload(uploadId, body);
    expect(() => openUpload("01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f", sealed.bytes)).toThrow("unable to authenticate data");
  });
});
