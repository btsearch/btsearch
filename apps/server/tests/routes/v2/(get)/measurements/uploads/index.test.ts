import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealUpload } from "../../../../../../src/features/measurements/rawFiles/seal.js";
import { rawFilePath, rawStoreFor } from "../../../../../../src/features/measurements/rawFiles/store.js";
import getUpload from "../../../../../../src/routes/v2/(get)/measurements/uploads/[id].js";
import getUploadFile from "../../../../../../src/routes/v2/(get)/measurements/uploads/[id]/file.js";
import getUploads from "../../../../../../src/routes/v2/(get)/measurements/uploads/index.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { crowdSettingsRow, deviceId, deviceRow, uploadFoldRow } from "../../../../../helpers/measurementFixtures.js";
import { expectError, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const userId = userSession().user.id;
const uploadId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";
const body = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.from("a zstd frame")]);
const receivedAt = new Date("2026-10-20T10:00:00Z");
let directory: string;

function upload(overrides: Record<string, unknown> = {}) {
  return {
    id: uploadId,
    deviceId,
    encoding: "zstd",
    sealKeyId: "2026",
    bodyBytes: body.length,
    bodySha256: createHash("sha256").update(body).digest(),
    store: "disk",
    appVersionCode: 140,
    receivedAt,
    status: "received",
    statusReason: null,
    statusChangedAt: receivedAt,
    excludedById: null,
    claimedAt: null,
    attempts: 0,
    lastError: null,
    objectDeletedAt: null,
    ...overrides,
  };
}

async function get(route: typeof getUploads | typeof getUpload | typeof getUploadFile, url: string, session = userSession()) {
  const app = await createRouteHarness(route, { session });
  return app.inject({ url });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "upload-files-"));
  vi.stubEnv("OBSERVATIONS_DIR", directory);
  vi.stubEnv("OBSERVATIONS_SEAL_KEYS", `2026:${randomBytes(32).toString("base64")}`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("GET /measurements/uploads", () => {
  it("lists your uploads, says when each file goes, and shows no result once one is withdrawn", async () => {
    const withdrawnAt = new Date("2026-10-21T08:00:00Z");
    const subtractedAt = new Date("2026-10-21T08:04:00Z");
    const withdrawn = { status: "withdrawn", statusChangedAt: withdrawnAt };
    const waitingId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f";
    const subtractedId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d11";
    dbMock.enqueueFor("select", "uploads", [
      { upload: upload(), userId, fold: null, sortKey: null },
      { upload: upload({ id: waitingId, ...withdrawn }), userId, fold: uploadFoldRow(waitingId), sortKey: null },
      { upload: upload({ id: subtractedId, ...withdrawn }), userId, fold: uploadFoldRow(subtractedId, { unfoldedAt: subtractedAt }), sortKey: null },
      { upload: upload({ id: "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d10", objectDeletedAt: withdrawnAt }), userId, fold: null, sortKey: null },
    ]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await get(getUploads, "/measurements/uploads");

    expect(response.statusCode).toBe(200);
    const data: { fileExpiresAt: string | null; result: unknown }[] = response.json().data;
    expect(data.map((item) => item.fileExpiresAt)).toEqual([
      new Date(receivedAt.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(withdrawnAt.getTime() + 60 * 60 * 1000).toISOString(),
      new Date(subtractedAt.getTime() + 60 * 60 * 1000).toISOString(),
      null,
    ]);
    expect(data.map((item) => item.result)).toEqual([null, null, null, null]);
  });

  it("refuses scope=all to someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await get(getUploads, "/measurements/uploads?scope=all"), 403, "FORBIDDEN", "Only an administrator can send `scope=all`");
  });

  it("refuses include=uploader to someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await get(getUploads, "/measurements/uploads?include=uploader"), 403, "FORBIDDEN");
  });

  it.each([
    { viewer: "an administrator", canManage: true, scopedToViewer: false },
    { viewer: "someone else", canManage: false, scopedToViewer: true },
  ])("lists another person's uploads by userIds for $viewer only", async ({ canManage, scopedToViewer }) => {
    const otherUserId = "22222222-2222-4222-8222-222222222222";
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: canManage });
    dbMock.enqueueFor("select", "uploads", []);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await get(getUploads, `/measurements/uploads?userIds=${otherUserId}`, userSession(userId, canManage ? "admin" : "user"));

    expect(response.statusCode).toBe(200);
    const { params } = whereQuery("uploads", "select");
    expect(params).toContain(otherUserId);
    expect(params.includes(userId)).toBe(scopedToViewer);
  });

  it("names each upload's uploader and device, and no uploader once the account is deleted", async () => {
    const orphanedId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d12";
    dbMock.enqueueFor("select", "uploads", [
      { upload: upload(), userId, fold: null, sortKey: null },
      { upload: upload({ id: orphanedId }), userId: null, fold: null, sortKey: null },
    ]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("select", "users", [{ id: userId, username: "tester", name: "Test User", image: null }]);
    dbMock.enqueueFor("select", "devices", [deviceRow()], [], []);
    const response = await get(getUploads, "/measurements/uploads?scope=all&include=uploader,device", userSession(userId, "admin"));

    expect(response.statusCode, response.body).toBe(200);
    const data: { uploader: unknown; device: { id: string; hardware: object } }[] = response.json().data;
    expect(data.map((item) => item.uploader)).toEqual([{ id: userId, username: "tester", name: "Test User", image: null }, null]);
    expect(data.map((item) => item.device.id)).toEqual([deviceId, deviceId]);
    expect(data[0]?.device.hardware).toEqual({ manufacturer: "Google", model: "Pixel 8", socModel: "Tensor G3" });
  });
});

describe("GET /measurements/uploads/:id", () => {
  it("answers what processing found in a processed upload", async () => {
    const fold = uploadFoldRow(uploadId, { distanceOnlyCount: 15 });
    dbMock.enqueueFor("select", "uploads", [{ upload: upload({ status: "processed" }), userId, fold }]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("select", "upload_drops", [
      { uploadId, reason: "poorAccuracy", sampleCount: 150 },
      { uploadId, reason: "closedCountry", sampleCount: 50 },
    ]);
    dbMock.enqueueFor("select", "upload_closed_countries", [
      { uploadId, countryCode: "LV" },
      { uploadId, countryCode: "LT" },
    ]);
    dbMock.enqueueFor("select", "upload_new_squares", [{ uploadId, count: 412 }]);
    dbMock.enqueueFor("select", "observed_cells", [{ uploadId, count: 7 }], [{ uploadId, count: 2 }]);
    const response = await get(getUpload, `/measurements/uploads/${uploadId}`);

    expect(response.statusCode).toBe(200);
    expect(response.json().data.result).toEqual({
      processedAt: "2026-10-20T10:02:00.000Z",
      startedAt: "2026-10-20T08:00:00.000Z",
      endedAt: "2026-10-20T09:30:00.000Z",
      bbox: { west: 20.95, south: 52.18, east: 21.08, north: 52.26 },
      samples: {
        total: 1200,
        kept: 1000,
        distanceOnly: 15,
        dropped: { poorAccuracy: 150, closedCountry: 50 },
        closedCountryCodes: ["LT", "LV"],
      },
      discoveries: { cells: 7, sites: 2, squares: 412 },
    });
  });

  it("keeps the drop counts of an upload rejected because no reading was left, without a time span", async () => {
    const rejectedAt = new Date("2026-10-20T10:03:00Z");
    const rejected = upload({ status: "rejected", statusReason: "noSamples", statusChangedAt: rejectedAt });
    dbMock.enqueueFor("select", "uploads", [{ upload: rejected, userId, fold: null }]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("select", "upload_drops", [
      { uploadId, reason: "noPosition", sampleCount: 377 },
      { uploadId, reason: "poorAccuracy", sampleCount: 35 },
    ]);
    dbMock.enqueueFor("select", "upload_closed_countries", []);
    dbMock.enqueueFor("select", "upload_new_squares", []);
    dbMock.enqueueFor("select", "observed_cells", [], []);
    const response = await get(getUpload, `/measurements/uploads/${uploadId}`);

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ rejectionReason: "noSamples", exclusion: null });
    expect(response.json().data.result).toEqual({
      processedAt: rejectedAt.toISOString(),
      startedAt: null,
      endedAt: null,
      bbox: null,
      samples: { total: 412, kept: 0, distanceOnly: 0, dropped: { noPosition: 377, poorAccuracy: 35 }, closedCountryCodes: [] },
      discoveries: { cells: 0, sites: 0, squares: 0 },
    });
  });

  it("hides another person's upload from someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "uploads", [{ upload: upload(), userId: "22222222-2222-4222-8222-222222222222" }]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    expectError(await get(getUpload, `/measurements/uploads/${uploadId}`), 404, "NOT_FOUND");
  });
});

describe("GET /measurements/uploads/:id/file", () => {
  async function storeFile(): Promise<void> {
    await rawStoreFor("disk").create(rawFilePath(receivedAt, uploadId, createHash("sha256").update(body).digest()), sealUpload(uploadId, body).bytes);
  }

  it("gives you your upload back as the app sent it", async () => {
    await storeFile();
    dbMock.enqueueFor("select", "uploads", [{ upload: upload(), userId }]);
    const response = await get(getUploadFile, `/measurements/uploads/${uploadId}/file`);

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(body);
    expect(response.headers["content-type"]).toBe("application/zstd");
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="${uploadId}.json.zst"`);
  });

  it("records an administrator's download of someone else's upload", async () => {
    await storeFile();
    dbMock.enqueueFor("select", "uploads", [{ upload: upload(), userId: "22222222-2222-4222-8222-222222222222" }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    const response = await get(getUploadFile, `/measurements/uploads/${uploadId}/file`, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      kind: "observations.upload_download",
      metadata: { upload_id: uploadId },
    });
  });

  it("answers 410 once the file is deleted", async () => {
    dbMock.enqueueFor("select", "uploads", [{ upload: upload({ objectDeletedAt: new Date() }), userId }]);
    const response = await get(getUploadFile, `/measurements/uploads/${uploadId}/file`);

    expectError(response, 410, "GONE", "The file of this upload is gone");
    expect(response.json().errors[0].details).toEqual([{ kind: "fileDeleted" }]);
  });
});
