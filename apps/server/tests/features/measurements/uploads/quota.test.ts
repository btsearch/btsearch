import { MEASUREMENT_UPLOAD_QUOTAS } from "@openbts/shared/contract";
import { describe, expect, it, vi } from "vitest";

import { assertUploadQuotas, bytesFreeAt, findMeasurementUploadsLimit } from "../../../../src/features/measurements/uploads/quota.js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";

const userId = userSession().user.id;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIB = 1024 * 1024;
const LIMIT_BYTES = MEASUREMENT_UPLOAD_QUOTAS.bytesPerPerson;

function dayOfUploads(now: number, newestBytes: number) {
  return [
    { receivedAt: new Date(now - 23 * HOUR_MS), bodyBytes: MIB },
    { receivedAt: new Date(now - 20 * HOUR_MS), bodyBytes: 3 * MIB },
    { receivedAt: new Date(now - HOUR_MS), bodyBytes: newestBytes },
  ];
}

describe("findMeasurementUploadsLimit", () => {
  it("counts the last day's uploads against the full quota of a known contributor", async () => {
    const oldestAt = new Date(Date.now() - 3_600_000);
    dbMock.enqueueFor("select", "uploads", [{ total: 2, bytes: "1048576", oldestAt }]);
    dbMock.enqueueFor("select", "contributors", [{ createdAt: new Date(Date.now() - 30 * DAY_MS) }]);
    expect(await findMeasurementUploadsLimit(userId)).toEqual({
      uploads: { limit: MEASUREMENT_UPLOAD_QUOTAS.uploadsPerPerson, remaining: MEASUREMENT_UPLOAD_QUOTAS.uploadsPerPerson - 2 },
      bytes: { limit: LIMIT_BYTES, remaining: LIMIT_BYTES - 1_048_576 },
      resetsAt: new Date(oldestAt.getTime() + DAY_MS).toISOString(),
    });
  });

  it("gives a new contributor the smaller byte quota", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 0, bytes: null, oldestAt: null }]);
    dbMock.enqueueFor("select", "contributors", [{ createdAt: new Date(Date.now() - DAY_MS) }]);
    expect(await findMeasurementUploadsLimit(userId)).toMatchObject({
      bytes: { limit: MEASUREMENT_UPLOAD_QUOTAS.bytesPerNewPerson, remaining: MEASUREMENT_UPLOAD_QUOTAS.bytesPerNewPerson },
      resetsAt: null,
    });
  });
});

describe("bytesFreeAt", () => {
  it.each([
    { name: "under its limit", newestBytes: LIMIT_BYTES - 5 * MIB, bodyBytes: 3 * MIB },
    { name: "already over its limit", newestBytes: LIMIT_BYTES - 2 * MIB, bodyBytes: MIB },
  ])(
    "frees room for an upload of a person $name once enough uploads have left the day, not when the oldest one does",
    ({ newestBytes, bodyBytes }) => {
      const now = Date.now();
      const uploads = dayOfUploads(now, newestBytes);
      expect(bytesFreeAt(uploads, LIMIT_BYTES, bodyBytes, now)).toBe(uploads[1]!.receivedAt.getTime() + DAY_MS);
    },
  );
});

describe("assertUploadQuotas", () => {
  it("names the byte quota when it runs out, and asks the app to retry when there is room again", async () => {
    const now = Date.now();
    const uploads = dayOfUploads(now, LIMIT_BYTES - 5 * MIB);
    const used = uploads.reduce((total, upload) => total + upload.bodyBytes, 0);
    dbMock.enqueueFor(
      "select",
      "uploads",
      [{ total: uploads.length, bytes: String(used), oldestAt: uploads[0]!.receivedAt }],
      [{ total: uploads.length, oldestAt: uploads[0]!.receivedAt }],
      uploads,
    );
    dbMock.enqueueFor("select", "contributors", [{ createdAt: new Date(now - 30 * DAY_MS) }]);
    const res = { header: vi.fn() };

    await expect(assertUploadQuotas(res, userId, "device-1", 3 * MIB)).rejects.toMatchObject({
      code: "MEASUREMENT_QUOTA_EXCEEDED",
      details: [{ quota: "bytes" }],
    });
    const retrySeconds = Number(res.header.mock.calls.find(([name]) => name === "Retry-After")?.[1]);
    expect(retrySeconds).toBeGreaterThan(3.9 * 3_600);
    expect(retrySeconds).toBeLessThanOrEqual(4 * 3_600);
  });
});
