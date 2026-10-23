import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rawFilePath, rawStoreFor } from "../../../../../../src/features/measurements/rawStore.js";
import { sealUpload } from "../../../../../../src/features/measurements/seal.js";
import getUpload from "../../../../../../src/routes/v2/(get)/measurements/uploads/[id].js";
import getUploadFile from "../../../../../../src/routes/v2/(get)/measurements/uploads/[id]/file.js";
import getUploads from "../../../../../../src/routes/v2/(get)/measurements/uploads/index.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { crowdSettingsRow, deviceId } from "../../../../../helpers/measurementFixtures.js";
import { expectError } from "../../../../../helpers/mutationAssertions.js";
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
  it("lists your uploads and says when each file goes", async () => {
    const withdrawnAt = new Date("2026-10-21T08:00:00Z");
    dbMock.enqueueFor("select", "uploads", [
      { upload: upload(), userId, sortKey: null },
      { upload: upload({ id: "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f", status: "withdrawn", statusChangedAt: withdrawnAt }), userId, sortKey: null },
      { upload: upload({ id: "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d10", objectDeletedAt: withdrawnAt }), userId, sortKey: null },
    ]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await get(getUploads, "/measurements/uploads");

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((item: { fileExpiresAt: string | null }) => item.fileExpiresAt)).toEqual([
      new Date(receivedAt.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(withdrawnAt.getTime() + 60 * 60 * 1000).toISOString(),
      null,
    ]);
  });

  it("refuses everyone's uploads to someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await get(getUploads, "/measurements/uploads?uploaders=all"), 403, "FORBIDDEN");
  });
});

describe("GET /measurements/uploads/:id", () => {
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

  it("answers 404 once the file is deleted", async () => {
    dbMock.enqueueFor("select", "uploads", [{ upload: upload({ objectDeletedAt: new Date() }), userId }]);
    expectError(await get(getUploadFile, `/measurements/uploads/${uploadId}/file`), 404, "NOT_FOUND", "The file of this upload is gone");
  });
});
