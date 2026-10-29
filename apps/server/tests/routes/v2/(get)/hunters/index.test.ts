import { describe, expect, it } from "vitest";

import getHunters from "../../../../../src/routes/v2/(get)/hunters/index.js";
import { dbMock, queryOf, userSession } from "../../../../helpers/boundaries.js";
import { expectError } from "../../../../helpers/mutationAssertions.js";
import { readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const otherUserId = "123e4567-e89b-42d3-a456-426614174002";

describe("getHunters", () => {
  it("lists listed public hunters in visible countries with their visible regions and a cursor", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "US" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "users", [
      { id: readUserId, username: "ala", name: "Ala", image: null, contactInfo: { instagram: " @ala ", facebook: "http://unsafe" }, key: "Ala" },
      { id: otherUserId, username: "bob", name: "Bob", image: null, contactInfo: null, key: "Bob" },
    ]);
    dbMock.enqueueFor("select", "hunter_regions", [
      { userId: readUserId, regionId: 3 },
      { userId: readUserId, regionId: 7 },
    ]);
    const app = await createRouteHarness(getHunters, { session: userSession(readUserId) });
    const response = await app.inject({ url: "/hunters?countryCodes=PL&regionIds=3&limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toEqual({
      data: [
        { id: readUserId, username: "ala", name: "Ala", image: null, contact: { instagram: "ala", facebook: null, email: null }, regionIds: [3, 7] },
      ],
      paging: { limit: 1, nextCursor: expect.any(String) },
    });

    const listed = queryOf(dbMock.calls.findLast((call) => call.table === "users")?.clauses.where?.[0]);
    expect(listed.params).toEqual(expect.arrayContaining([true, "public", "US", "PL", 3]));
    const regions = queryOf(dbMock.calls.find((call) => call.table === "hunter_regions")?.clauses.where?.[0]);
    expect(regions.params).toEqual(expect.arrayContaining([readUserId, "US"]));
    expect(regions.params).not.toContain("PL");
  });

  it("skips the region lookup for an empty page", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "users", []);
    const app = await createRouteHarness(getHunters, { session: userSession(readUserId) });
    const response = await app.inject({ url: "/hunters" });
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
    expect(dbMock.calls.some((call) => call.table === "hunter_regions")).toBe(false);
  });

  it("refuses guests", async () => {
    const app = await createRouteHarness(getHunters);
    expectError(await app.inject({ url: "/hunters" }), 401, "UNAUTHORIZED");
    expect(dbMock.calls).toHaveLength(0);
  });
});
