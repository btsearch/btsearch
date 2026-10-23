import { MEASUREMENT_UPLOAD_QUOTAS } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { findMeasurementUploadsLimit } from "../../../src/features/measurements/quota.js";
import { dbMock, userSession } from "../../helpers/boundaries.js";

const userId = userSession().user.id;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("findMeasurementUploadsLimit", () => {
  it("counts the last day's uploads against the full quota of a known contributor", async () => {
    const oldestAt = new Date(Date.now() - 3_600_000);
    dbMock.enqueueFor("select", "uploads", [{ total: 2, bytes: "1048576", oldestAt }]);
    dbMock.enqueueFor("select", "contributors", [{ createdAt: new Date(Date.now() - 30 * DAY_MS) }]);
    expect(await findMeasurementUploadsLimit(userId)).toEqual({
      uploads: { limit: MEASUREMENT_UPLOAD_QUOTAS.uploadsPerPerson, remaining: MEASUREMENT_UPLOAD_QUOTAS.uploadsPerPerson - 2 },
      bytes: { limit: MEASUREMENT_UPLOAD_QUOTAS.bytesPerPerson, remaining: MEASUREMENT_UPLOAD_QUOTAS.bytesPerPerson - 1_048_576 },
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
