import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { openUpload, sealUpload } from "../../../../src/features/measurements/rawFiles/seal.js";

const uploadId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";
const body = Buffer.from("a compressed measurement batch");

function sealKey(): string {
  return randomBytes(32).toString("base64");
}

describe("sealing", () => {
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
