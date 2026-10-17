import { describe, expect, it } from "vitest";

import patchOwnProfile from "../../../../../src/routes/v2/(patch)/me/profile.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError } from "../../../../helpers/mutationAssertions.js";
import { readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const privateProfile = {
  bio: null,
  contactInfo: { email: "old@example.com", facebook: "https://facebook.com/tester" },
  profileVisibility: "private",
  hunterListing: false,
  hunterRegions: [],
};
const listedProfile = { ...privateProfile, profileVisibility: "public", hunterListing: true, hunterRegions: [{ regionId: 4 }] };

async function patch(payload: object) {
  const app = await createRouteHarness(patchOwnProfile, { session: userSession(readUserId) });
  return app.inject({ method: "PATCH", url: "/me/profile", payload });
}

describe("patchOwnProfile", () => {
  it("publishes the profile, merges contact changes and replaces the hunter regions", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "US" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "regions", [{ id: 2 }, { id: 5 }]);
    dbMock.query.users.findFirst.mockResolvedValue(privateProfile);
    dbMock.enqueueFor("update", "users", []);
    dbMock.enqueueFor("delete", "hunter_regions", []);
    dbMock.enqueueFor("insert", "hunter_regions", []);
    const response = await patch({
      visibility: "public",
      isListedAsHunter: true,
      hunterRegionIds: [5, 2, 5],
      contact: { instagram: "tester", email: null },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      bio: null,
      contact: { instagram: "tester", facebook: "https://facebook.com/tester", email: null },
      visibility: "public",
      isListedAsHunter: true,
      hunterRegionIds: [2, 5],
    });
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toEqual({
      bio: null,
      contactInfo: { facebook: "https://facebook.com/tester", instagram: "tester" },
      profileVisibility: "public",
      hunterListing: true,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert")?.values).toEqual([
      { userId: readUserId, regionId: 2 },
      { userId: readUserId, regionId: 5 },
    ]);
  });

  it("takes a profile that turns private off the directory and keeps its regions", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.query.users.findFirst.mockResolvedValue(listedProfile);
    dbMock.enqueueFor("update", "users", []);
    const response = await patch({ visibility: "private" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ visibility: "private", isListedAsHunter: false, hunterRegionIds: [4] });
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ profileVisibility: "private", hunterListing: false });
    expect(dbMock.calls.some((call) => call.table === "hunter_regions")).toBe(false);
  });

  it.each([
    ["a private profile", privateProfile, { isListedAsHunter: true }],
    ["a hunter without regions", { ...listedProfile, hunterRegions: [] }, { isListedAsHunter: true }],
    ["the last region of a listed hunter", listedProfile, { hunterRegionIds: [] }],
  ])("refuses to list %s", async (_case, current, payload) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.query.users.findFirst.mockResolvedValue(current);
    expectError(await patch(payload), 400, "BAD_REQUEST");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("refuses regions that do not exist or sit in a hidden country", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "US" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "regions", [{ id: 2 }]);
    expectError(await patch({ hunterRegionIds: [2, 9] }), 400, "BAD_REQUEST");
    expect(dbMock.query.users.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a bio with a link", async () => {
    const response = await patch({ bio: "see example.com" });
    expect(response.statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});
