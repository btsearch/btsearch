import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/measurements/contributors/[userId].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../../helpers/officialFixtures.js";

const contributorId = "33333333-3333-4333-8333-333333333333";
const blockedAt = new Date("2026-10-24T12:00:00Z");
const contributor = { id: contributorId, username: "driver", name: "Driver", image: null };
const staff = { id: STAFF_ID, username: "staff", name: "Staff Member", image: null };

function read(userId = contributorId) {
  return injectMutation(route, { method: "GET", url: `/measurements/contributors/${userId}` }, signInAs("admin"));
}

function scriptContributor(rows: object[]) {
  dbMock.enqueueFor("select", "contributors", rows);
  dbMock.enqueueFor("select", "terms_acceptances", rows.length === 0 ? [] : [{ userId: contributorId, version: 2, acceptedAt: blockedAt }]);
  dbMock.enqueueFor("select", "uploads", rows.length === 0 ? [] : [{ userId: contributorId, firstUploadAt: blockedAt, uploadCount: 4 }]);
  dbMock.enqueueFor(
    "select",
    "devices",
    rows.length === 0 ? [] : [{ userId: contributorId, deviceCount: 2, revokedDeviceCount: 1 }],
    rows.length === 0 ? [] : [{ userId: contributorId, computed: 0.5, effective: 0.5, samples: 40 }],
  );
  dbMock.enqueueFor("select", "device_scores", []);
}

describe("GET /measurements/contributors/:userId", () => {
  it("answers an administrator with the person, their block as it was written, who set it and when", async () => {
    const block = { userId: contributorId, blockedAt, blockedById: STAFF_ID, reason: "Fake readings", until: null };
    scriptContributor([{ user: contributor, vouch: null, vouchedBy: null, block, blockedBy: staff }]);
    const response = await read();

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toEqual({
      user: contributor,
      termsVersion: 2,
      firstUploadAt: blockedAt.toISOString(),
      deviceCount: 2,
      revokedDeviceCount: 1,
      uploadCount: 4,
      weight: { computed: 0.5, effective: 0.5 },
      trackRecord: { timingAdvanceAgreement: null, droppedShare: 0, mockShare: 0, phantomCells: 0 },
      vouch: null,
      block: { reason: "Fake readings", by: staff, at: blockedAt.toISOString(), endsAt: null },
    });
  });

  it("answers 404 for someone who never accepted the contributor terms", async () => {
    scriptContributor([]);
    expectError(await read("55555555-5555-4555-8555-555555555555"), 404, "NOT_FOUND");
  });
});
