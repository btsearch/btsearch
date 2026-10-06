import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import getUserComments from "../../../../../../src/routes/v2/(get)/users/[username]/comments.js";
import getUserProfile from "../../../../../../src/routes/v2/(get)/users/[username]/index.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { readDate, readStation, readUserId } from "../../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const profile = {
  id: readUserId,
  username: "tester",
  name: "Test User",
  image: null,
  bio: "Bio",
  role: "editor",
  contactInfo: { instagram: " @tester ", facebook: "http://unsafe", email: " tester@example.com " },
  profileVisibility: "public",
  hunterListing: true,
  hunterRegions: [1],
  createdAt: readDate,
};

describe("getUserProfile", () => {
  it.each(["public", "private"])("applies %s profile privacy to a guest", async (visibility) => {
    getRuntimeSettings().enableStationComments = false;
    dbMock.query.users.findFirst.mockResolvedValue({ ...profile, profileVisibility: visibility });
    const app = await createRouteHarness(getUserProfile);
    const response = await app.inject({ url: "/users/TESTER" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(dbMock.query.users.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { username: "tester" } }));
    expect(response.json().data).toMatchObject(
      visibility === "public"
        ? { name: "Test User", bio: "Bio", role: "editor", isRestricted: false, contact: null, isContactHidden: true, hunterRegionIds: [1] }
        : { name: null, bio: null, role: null, isRestricted: true, contact: null, isContactHidden: false, hunterRegionIds: null },
    );
  });

  it("shows the owner's private profile with normalized contact details", async () => {
    getRuntimeSettings().enableStationComments = false;
    dbMock.query.users.findFirst.mockResolvedValue({ ...profile, profileVisibility: "private" });
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const app = await createRouteHarness(getUserProfile, { session: userSession(readUserId) });
    const response = await app.inject({ url: "/users/tester" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      isRestricted: false,
      bio: "Bio",
      contact: { instagram: "tester", facebook: null, email: "tester@example.com" },
      hunterRegionIds: null,
    });
  });

  it("sums approved visible-country comment counts", async () => {
    getRuntimeSettings().enableStationComments = true;
    dbMock.query.users.findFirst.mockResolvedValue(profile);
    dbMock.enqueueFor("select", "countries", [{ code: "US" }]);
    dbMock.enqueueFor("select", "station_comments", [
      { operatorId: 1, count: 2 },
      { operatorId: null, count: 3 },
    ]);
    const app = await createRouteHarness(getUserProfile);
    const response = await app.inject({ url: "/users/tester" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.comments).toEqual({
      total: 5,
      operatorCounts: [
        { operatorId: 1, count: 2 },
        { operatorId: null, count: 3 },
      ],
    });
  });

  it("reports an unknown username as missing", async () => {
    dbMock.query.users.findFirst.mockResolvedValue(undefined);
    const app = await createRouteHarness(getUserProfile);
    expect((await app.inject({ url: "/users/unknown" })).statusCode).toBe(404);
  });
});

describe("getUserComments", () => {
  it.each(["createdAt", "-createdAt"])("filters approved comments by operator and paginates %s with embedded stations", async (sort) => {
    getRuntimeSettings().enableStationComments = true;
    dbMock.query.users.findFirst.mockResolvedValue(profile);
    dbMock.enqueueFor("select", "countries", [{ code: "US" }]);
    const comment = {
      id: "123e4567-e89b-42d3-a456-426614174001",
      stationId: 1,
      content: "Lorem ipsum dolor sit amet",
      status: "approved",
      attachments: null,
      createdAt: readDate,
      updatedAt: readDate,
      authorId: readUserId,
      authorUsername: "tester",
      authorName: "Private name",
      authorImage: null,
      authorVisibility: "private",
    };
    dbMock.enqueueFor("select", "station_comments", [comment, { ...comment, id: "123e4567-e89b-42d3-a456-426614174002" }]);
    dbMock.enqueueFor("select", "stations", [readStation]);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const app = await createRouteHarness(getUserComments);
    const response = await app.inject({ url: `/users/tester/comments?operatorIds=1&sort=${sort}&limit=1&include=station` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ id: comment.id, content: comment.content, attachments: [], author: { name: null }, station: { id: 1, siteId: "Łódź-1" } }],
      paging: { limit: 1, nextCursor: expect.any(String) },
    });
    expect(response.json().paging).not.toHaveProperty("total");
    const call = dbMock.calls.find((entry) => entry.table === "station_comments");
    const where = new PgDialect().sqlToQuery(call?.clauses.where?.[0] as SQL);
    expect(where.params).toEqual(expect.arrayContaining([readUserId, "approved", "US", 1]));
    const order = new PgDialect().sqlToQuery(call?.clauses.orderBy?.[0] as SQL).sql;
    expect(order).toContain(sort === "createdAt" ? "asc" : "desc");
  });

  it("returns a public profile's empty approved collection with a total", async () => {
    getRuntimeSettings().enableStationComments = true;
    dbMock.query.users.findFirst.mockResolvedValue(profile);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "station_comments", [], [{ total: 0 }]);
    const app = await createRouteHarness(getUserComments);
    const response = await app.inject({ url: "/users/tester/comments?includeTotal=true&limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 1, total: 0, nextCursor: null } });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("hides a private profile's comments even from a non-owner staff member", async () => {
    getRuntimeSettings().enableStationComments = true;
    dbMock.query.users.findFirst.mockResolvedValue({ ...profile, id: "123e4567-e89b-42d3-a456-426614174002", profileVisibility: "private" });
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getUserComments, { session: userSession(readUserId, "admin") });
    expect((await app.inject({ url: "/users/tester/comments" })).statusCode).toBe(404);
    expect(dbMock.calls.some((call) => call.table === "station_comments")).toBe(false);
  });

  it("checks the feature flag before looking up the profile", async () => {
    getRuntimeSettings().enableStationComments = false;
    const app = await createRouteHarness(getUserComments);
    expect((await app.inject({ url: "/users/tester/comments" })).statusCode).toBe(403);
    expect(dbMock.query.users.findFirst).not.toHaveBeenCalled();
  });
});
