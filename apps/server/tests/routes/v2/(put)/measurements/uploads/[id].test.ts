import type { MeasurementContentType } from "@openbts/shared/contract";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signedUploadLines } from "../../../../../../src/features/measurements/intake.js";
import { rawFilePath } from "../../../../../../src/features/measurements/rawStore.js";
import { openUpload } from "../../../../../../src/features/measurements/seal.js";
import route from "../../../../../../src/routes/v2/(put)/measurements/uploads/[id].js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { appToken, crowdSettingsRow, deviceId, setMeasurementUploads } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;
const deviceKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const devicePublicKey = deviceKey.publicKey.export({ type: "spki", format: "der" });
const zstdBody = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.from("a zstd frame")]);
const nobodyElse = "22222222-2222-4222-8222-222222222222";
let directory: string;

function uploadIdAt(time: number): string {
  const hex = time.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7abc-8def-0123456789ab`;
}

const uploadId = uploadIdAt(Date.now() - 60_000);

function sha256(body: Buffer): Buffer {
  return createHash("sha256").update(body).digest();
}

function signatureOf(id: string, body: Buffer, contentType: MeasurementContentType = "application/zstd"): string {
  return sign("sha256", signedUploadLines(id, deviceId, contentType, sha256(body)), { key: deviceKey.privateKey, dsaEncoding: "der" }).toString(
    "base64url",
  );
}

function put(id: string, body: Buffer, headers: Partial<Record<string, string>> = {}) {
  return injectMutation(
    route,
    {
      method: "PUT",
      url: `/measurements/uploads/${id}`,
      payload: body,
      headers: {
        "content-type": "application/zstd",
        "x-device-id": deviceId,
        "x-device-signature": signatureOf(id, body),
        "x-app-version-code": "140",
        ...headers,
      },
    },
    { session: userSession(), oauthToken: appToken() },
  );
}

function uploadRow(overrides: Record<string, unknown> = {}) {
  const receivedAt = new Date();
  return {
    id: uploadId,
    deviceId,
    encoding: "zstd",
    sealKeyId: "2026",
    bodyBytes: zstdBody.length,
    bodySha256: sha256(zstdBody),
    store: "disk",
    appVersionCode: 140,
    receivedAt,
    status: "received",
    statusReason: null,
    statusChangedAt: receivedAt,
    claimedAt: null,
    attempts: 0,
    lastError: null,
    objectDeletedAt: null,
    ...overrides,
  };
}

function scriptChecks({ acceptedVersion = 2, block = null as { until: Date | null } | null } = {}) {
  dbMock.enqueueFor("select", "uploads", []);
  dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
  dbMock.enqueueFor("select", "terms_acceptances", [{ version: acceptedVersion, acceptedAt: new Date() }]);
  dbMock.enqueueFor("select", "contributor_blocks", block ? [block] : []);
}

function scriptDevice({ owner = userId, revokedAt = null as Date | null } = {}) {
  dbMock.enqueueFor("select", "devices", [{ id: deviceId, userId: owner, publicKey: devicePublicKey, revokedAt }]);
}

function scriptQuotas({ personUploads = 0, deviceUploads = 0, storedBytes = "0" } = {}) {
  dbMock.enqueueFor("select", "uploads", [{ total: personUploads, bytes: null, oldestAt: new Date(Date.now() - 60 * 60 * 1000) }]);
  dbMock.enqueueFor("select", "contributors", []);
  dbMock.enqueueFor("select", "uploads", [{ total: deviceUploads, oldestAt: new Date(Date.now() - 60 * 60 * 1000) }]);
  dbMock.enqueueFor("select", "uploads", [{ bytes: storedBytes }]);
}

async function storedFiles(): Promise<string[]> {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  return readdir(join(directory, "raw", day)).catch(() => []);
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "uploads-"));
  vi.stubEnv("OBSERVATIONS_DIR", directory);
  vi.stubEnv("OBSERVATIONS_SEAL_KEYS", `2026:${randomBytes(32).toString("base64")}`);
  setMeasurementUploads(true);
});

afterEach(async () => {
  setMeasurementUploads(false);
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("PUT /measurements/uploads/:id", () => {
  it("seals and stores a signed upload, records it and wakes the engine", async () => {
    scriptChecks();
    scriptDevice();
    scriptQuotas();
    dbMock.enqueueFor("insert", "uploads", [uploadRow()]);
    dbMock.enqueueFor("execute", undefined, []);
    const response = await put(uploadId, zstdBody);

    expect(response.statusCode).toBe(201);
    const recorded = dbMock.calls.find((call) => call.operation === "insert" && call.table === "uploads")?.values as { receivedAt: Date };
    expect(recorded).toMatchObject({
      id: uploadId,
      deviceId,
      encoding: "zstd",
      bodySha256: sha256(zstdBody),
      store: "disk",
      appVersionCode: 140,
      sealKeyId: "2026",
    });
    const sealed = await readFile(join(directory, rawFilePath(recorded.receivedAt, uploadId, sha256(zstdBody))));
    expect(openUpload(uploadId, sealed)).toEqual(zstdBody);
    expect(dbMock.execute).toHaveBeenCalled();
  });

  it("answers 200 with the stored upload when it comes again, even after uploads were switched off", async () => {
    setMeasurementUploads(false);
    dbMock.enqueueFor("select", "uploads", [{ upload: uploadRow(), userId }]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    expect((await put(uploadId, zstdBody)).statusCode).toBe(200);
  });

  it("refuses the same id with another body", async () => {
    dbMock.enqueueFor("select", "uploads", [{ upload: uploadRow(), userId }]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    expectError(await put(uploadId, Buffer.concat([zstdBody, Buffer.from("more")])), 409, "UPLOAD_ID_CONFLICT");
  });

  it("hides another person's upload", async () => {
    dbMock.enqueueFor("select", "uploads", [{ upload: uploadRow(), userId: nobodyElse }]);
    expectError(await put(uploadId, zstdBody), 404, "NOT_FOUND");
  });

  it("answers 200 and keeps the one file when another request recorded the same upload first", async () => {
    scriptChecks();
    scriptDevice();
    scriptQuotas();
    dbMock.enqueueFor("insert", "uploads", []);
    dbMock.enqueueFor("select", "uploads", [{ upload: uploadRow(), userId }]);
    const response = await put(uploadId, zstdBody);

    expect(response.statusCode).toBe(200);
    expect(await storedFiles()).toHaveLength(1);
  });

  it("deletes its own file and answers 409 when another body was recorded first under the id", async () => {
    scriptChecks();
    scriptDevice();
    scriptQuotas();
    dbMock.enqueueFor("insert", "uploads", []);
    dbMock.enqueueFor("select", "uploads", [{ upload: uploadRow({ bodySha256: sha256(Buffer.from("another body")) }), userId }]);

    expectError(await put(uploadId, zstdBody), 409, "UPLOAD_ID_CONFLICT");
    expect(await storedFiles()).toEqual([]);
  });

  it.each([
    { name: "uploads are switched off", prepare: () => setMeasurementUploads(false), checks: null, headers: {}, code: "FEATURE_DISABLED" },
    { name: "the app is too old", prepare: () => undefined, checks: {}, headers: { "x-app-version-code": "99" }, code: "APP_UPDATE_REQUIRED" },
    { name: "the current terms are not accepted", prepare: () => undefined, checks: { acceptedVersion: 1 }, headers: {}, code: "TERMS_NOT_ACCEPTED" },
    { name: "the person is blocked", prepare: () => undefined, checks: { block: { until: null } }, headers: {}, code: "CONTRIBUTOR_BLOCKED" },
  ])("refuses an upload with 403 when $name", async ({ prepare, checks, headers, code }) => {
    prepare();
    if (checks === null) dbMock.enqueueFor("select", "uploads", []);
    else scriptChecks(checks);
    expectError(await put(uploadId, zstdBody, headers), 403, code);
  });

  it("tells a person blocked for a while when the block ends", async () => {
    const until = new Date("2026-11-01T00:00:00Z");
    scriptChecks({ block: { until } });
    const response = await put(uploadId, zstdBody);

    expectError(response, 403, "CONTRIBUTOR_BLOCKED");
    expect(response.json().errors[0].details).toEqual([{ until: until.toISOString() }]);
  });

  it("refuses an id from more than 120 days ago", async () => {
    const oldId = uploadIdAt(Date.now() - 121 * 24 * 60 * 60 * 1000);
    scriptChecks();
    const response = await put(oldId, zstdBody);

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([
      { field: "id", validationMessage: "Its time must lie between 120 days ago and one day ahead" },
    ]);
  });

  it("refuses a body that does not start like its content type", async () => {
    scriptChecks();
    const response = await put(uploadId, Buffer.from([0x1f, 0x8b, 0x08]));

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "body", validationMessage: "Does not start like application/zstd" }]);
  });

  it("refuses a body over 4 MiB", async () => {
    scriptChecks();
    expectError(await put(uploadId, Buffer.concat([zstdBody, Buffer.alloc(4 * 1024 * 1024)])), 413, "FST_ERR_CTP_BODY_TOO_LARGE");
  });

  it("refuses a body that is not zstd or gzip", async () => {
    const response = await injectMutation(
      route,
      {
        method: "PUT",
        url: `/measurements/uploads/${uploadId}`,
        payload: { snapshots: [] },
        headers: { "x-device-id": deviceId, "x-device-signature": "AA", "x-app-version-code": "140" },
      },
      { session: userSession(), oauthToken: appToken() },
    );
    expectError(response, 415, "FST_ERR_CTP_INVALID_MEDIA_TYPE");
  });

  it.each([
    { name: "another person's device", device: { owner: nobodyElse }, headers: {}, status: 404, code: "DEVICE_NOT_FOUND" },
    { name: "a revoked device", device: { revokedAt: new Date() }, headers: {}, status: 403, code: "DEVICE_REVOKED" },
    {
      name: "a signature over another upload",
      device: {},
      headers: { "x-device-signature": signatureOf(uploadIdAt(Date.now()), zstdBody) },
      status: 403,
      code: "INVALID_SIGNATURE",
    },
    {
      name: "a signature over another content type",
      device: {},
      headers: { "x-device-signature": signatureOf(uploadId, zstdBody, "application/gzip") },
      status: 403,
      code: "INVALID_SIGNATURE",
    },
  ])("refuses an upload from $name", async ({ device, headers, status, code }) => {
    scriptChecks();
    scriptDevice(device);
    expectError(await put(uploadId, zstdBody, headers), status, code);
  });

  it.each([
    { quota: "uploads", counts: { personUploads: 300 }, message: "At most 300 uploads in 24 hours" },
    { quota: "deviceUploads", counts: { deviceUploads: 200 }, message: "At most 200 uploads from one device in 24 hours" },
  ])("names the $quota quota when it runs out, and says when to try again", async ({ quota, counts, message }) => {
    scriptChecks();
    scriptDevice();
    scriptQuotas(counts);
    const response = await put(uploadId, zstdBody);

    expectError(response, 429, "MEASUREMENT_QUOTA_EXCEEDED", message);
    expect(response.json().errors[0].details).toEqual([{ quota }]);
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(22 * 60 * 60);
  });

  it("asks the app to try again in hours when stored uploads reach the budget", async () => {
    scriptChecks();
    scriptDevice();
    scriptQuotas({ storedBytes: String(100 * 1024 ** 3) });
    const response = await put(uploadId, zstdBody);

    expectError(response, 503, "SERVICE_UNAVAILABLE", "Measurement storage is full. Send the upload again in a few hours");
    expect(response.headers["retry-after"]).toBe(String(6 * 60 * 60));
    expect(await storedFiles()).toEqual([]);
  });
});
