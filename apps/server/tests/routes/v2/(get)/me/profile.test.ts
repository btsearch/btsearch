import { describe, expect, it } from "vitest";

import getOwnProfile from "../../../../../src/routes/v2/(get)/me/profile.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError } from "../../../../helpers/mutationAssertions.js";
import { readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getOwnProfile", () => {
  it("returns the stored profile and keeps hunter regions of a private profile that cannot be listed", async () => {
    dbMock.query.users.findFirst.mockResolvedValue({
      bio: "Bio",
      contactInfo: { email: "tester@example.com" },
      profileVisibility: "private",
      hunterListing: true,
      hunterRegions: [{ regionId: 2 }, { regionId: 5 }],
    });
    const app = await createRouteHarness(getOwnProfile, { session: userSession(readUserId) });
    const response = await app.inject({ url: "/me/profile" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toEqual({
      bio: "Bio",
      contact: { instagram: null, facebook: null, email: "tester@example.com" },
      visibility: "private",
      isListedAsHunter: false,
      hunterRegionIds: [2, 5],
    });
    expect(dbMock.query.users.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: readUserId } }));
  });

  it("refuses guests", async () => {
    const app = await createRouteHarness(getOwnProfile);
    expectError(await app.inject({ url: "/me/profile" }), 401, "UNAUTHORIZED");
    expect(dbMock.query.users.findFirst).not.toHaveBeenCalled();
  });
});
