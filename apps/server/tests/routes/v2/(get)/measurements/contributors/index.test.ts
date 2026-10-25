import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/measurements/contributors/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { injectMutation } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../../helpers/officialFixtures.js";

const LOW_ID = "33333333-3333-4333-8333-333333333333";
const HIGH_ID = "44444444-4444-4444-8444-444444444444";
const vouchedAt = new Date("2026-10-24T12:00:00Z");
const staff = { id: STAFF_ID, username: "staff", name: null, image: null };

function contributorRow(id: string, extra: Record<string, unknown> = {}) {
  return { user: { id, username: id.slice(0, 4), name: null, image: null }, vouch: null, vouchedBy: null, block: null, blockedBy: null, ...extra };
}

describe("GET /measurements/contributors", () => {
  it("answers in the ranking's order, each person with the weights of their devices, and pages on", async () => {
    const vouch = { userId: LOW_ID, weight: 1.5, confirmsAlone: false, reason: "Known to the team", vouchedById: STAFF_ID, vouchedAt, until: null };
    const block = { userId: HIGH_ID, blockedAt: vouchedAt, blockedById: STAFF_ID, reason: "Fake readings", until: null };
    dbMock.enqueueFor("select", "contributors", [{ userId: LOW_ID }, { userId: HIGH_ID }, { userId: "55555555-5555-4555-8555-555555555555" }]);
    dbMock.enqueueFor("select", "contributors", [
      contributorRow(HIGH_ID, { block, blockedBy: staff }),
      contributorRow(LOW_ID, { vouch, vouchedBy: staff }),
    ]);
    dbMock.enqueueFor("select", "terms_acceptances", [{ userId: LOW_ID, version: 1, acceptedAt: vouchedAt }]);
    dbMock.enqueueFor("select", "uploads", [{ userId: HIGH_ID, firstUploadAt: vouchedAt, uploadCount: 12 }]);
    dbMock.enqueueFor(
      "select",
      "devices",
      [
        { userId: LOW_ID, deviceCount: 1, revokedDeviceCount: 0 },
        { userId: HIGH_ID, deviceCount: 3, revokedDeviceCount: 1 },
      ],
      [
        { userId: LOW_ID, computed: 0.1, effective: 1.5, samples: 0 },
        { userId: HIGH_ID, computed: 0.5, effective: 0.5, samples: 100 },
        { userId: HIGH_ID, computed: 1, effective: 1, samples: 300 },
      ],
    );
    dbMock.enqueueFor("select", "device_scores", []);

    const response = await injectMutation(route, { method: "GET", url: "/measurements/contributors?limit=2" }, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    const { data, paging } = response.json();
    const summarized = data.map((contributor: { user: { id: string }; weight: object; vouch: object | null; block: object | null }) => [
      contributor.user.id,
      contributor.weight,
      contributor.vouch !== null,
      contributor.block !== null,
    ]);
    expect(summarized).toEqual([
      [LOW_ID, { computed: 0.1, effective: 1.5 }, true, false],
      [HIGH_ID, { computed: 0.875, effective: 0.875 }, false, true],
    ]);
    expect(data[0]).toMatchObject({ deviceCount: 1, revokedDeviceCount: 0, uploadCount: 0 });
    expect(data[1]).toMatchObject({
      termsVersion: null,
      firstUploadAt: vouchedAt.toISOString(),
      deviceCount: 3,
      revokedDeviceCount: 1,
      uploadCount: 12,
      block: { reason: "Fake readings", by: staff, at: vouchedAt.toISOString(), endsAt: null },
    });
    expect(paging).toEqual({ limit: 2, nextCursor: expect.any(String) });
  });
});
