import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/stations/[id]/comments.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { commentView } from "../../../../../helpers/commentFixtures.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

describe("GET /stations/:id/comments", () => {
  it("returns FEATURE_DISABLED while station comments are disabled", async () => {
    const response = await injectMutation(route, { method: "GET", url: "/stations/12/comments" });
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns approved comments with private author names hidden and private caching", async () => {
    getRuntimeSettings().enableStationComments = true;
    dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "station_comments", [{ ...commentView, status: "approved" }]);
    const response = await injectMutation(route, { method: "GET", url: "/stations/12/comments" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toMatchObject({ data: [{ status: "approved", author: { name: null } }] });
  });

  it("rejects requesting every pending comment without moderation permission", async () => {
    getRuntimeSettings().enableStationComments = true;
    dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(
      route,
      { method: "GET", url: "/stations/12/comments?includePending=true" },
      { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") },
    );
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls.some((call) => call.table === "station_comments")).toBe(false);
  });
});
