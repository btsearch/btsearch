import { describe, expect, it } from "vitest";

import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { injectMutation } from "../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const removedSite = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: ownerId,
  type: "station_official_permit_added",
  title: "Station permits changed",
  submissionId: null,
  stationId: null,
  officialSiteId: null,
  metadata: { station_id: "BT1002", permits_added: 1, permits_deleted: 2, official_sites_added: 3, official_site_deleted: true, count: 3 },
  actionUrl: null,
  readAt: null,
  pushQueuedAt: null,
  pushSentAt: null,
  createdAt: new Date("2026-10-16T00:00:00Z"),
  updatedAt: new Date("2026-10-16T00:00:00Z"),
};

describe("v1 GET /notifications keeps the names of official permit changes", () => {
  it("answers the stored official names with the v1 type and change fields", async () => {
    dbMock.query.notifications.findMany.mockReturnValue({ prepare: () => ({ execute: async () => [removedSite] }) } as unknown as Promise<unknown>);
    const { default: route } = await import("../../../../src/routes/v1/(get)/notifications/index.js");
    dbMock.enqueueFor("select", "notifications", [{ total: 1 }], [{ total: 1 }]);

    const response = await injectMutation(route, { method: "GET", url: "/notifications" }, { session: userSession(ownerId) });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      type: "station_uke_permit_added",
      station: { id: null, station_id: "BT1002", source: "uke" },
      changes: { permits: { added: 1, deleted: 2 }, ukeStationsAdded: 3, removedFromUke: true },
    });
  });
});
