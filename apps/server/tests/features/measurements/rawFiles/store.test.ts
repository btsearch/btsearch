import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rawFilePath, rawStoreFor } from "../../../../src/features/measurements/rawFiles/store.js";

const uploadId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";
const receivedAt = new Date("2026-10-23T12:00:00Z");
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "raw-store-"));
  vi.stubEnv("OBSERVATIONS_DIR", directory);
});

afterEach(async () => {
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

  it.skipIf(process.platform === "win32")("leaves what it writes readable to the engine under a strict umask", async () => {
    const umask = process.umask(0o077);
    try {
      await rawStoreFor("disk").create(path, body);
    } finally {
      process.umask(umask);
    }

    expect((await stat(join(directory, path))).mode & 0o777).toBe(0o644);
    expect((await stat(join(directory, "raw/2026"))).mode & 0o777).toBe(0o755);
  });
});
