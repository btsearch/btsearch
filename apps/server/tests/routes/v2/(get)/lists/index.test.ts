import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(get)/lists/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOwnerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const thirdOwnerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const row = {
  id: 1,
  uuid: "list-1",
  name: "Sites",
  description: null,
  is_public: false,
  notificationsEnabled: true,
  created_by: ownerId,
  stations: { internal: [12], uke: [24] },
  radiolines: [36],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = { method: "GET" as const, url: "/lists" };
const options = { session: userSession(ownerId) };

describe("GET /lists", () => {
  it("requires administrator permission for the all-owner view", async () => {
    getRuntimeSettings().enableUserLists = true;
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await injectMutation(route, { ...request, url: "/lists?owners=all" }, options), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["/lists?ownerIds=", "/lists?owners=all&ownerIds=", "/lists?isPublic=true&includeTotal=true&cursor=malformed&ownerIds="])(
    "refuses the owner filter without the permission to read everyone's lists, whatever else is asked: %s",
    async (url) => {
      getRuntimeSettings().enableUserLists = true;
      authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
      const response = await injectMutation(route, { ...request, url: url + otherOwnerId }, options);
      expectError(response, 403, "INSUFFICIENT_PERMISSIONS", "Only an administrator can filter lists by owner");
      expect(authBoundary.auth.api.userHasPermission).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ permissions: { user_lists: ["read_all"] } }) }),
      );
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("rejects the owner filter outside the all-owner view for a caller who may read everyone's lists", async () => {
    getRuntimeSettings().enableUserLists = true;
    const response = await injectMutation(route, { ...request, url: `/lists?ownerIds=${otherOwnerId}` }, options);
    expectError(response, 400, "INVALID_QUERY", "ownerIds needs owners=all");
    expect(dbMock.calls).toEqual([]);
  });

  it("narrows the all-owner view by owner and visibility and counts the same rows", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "user_lists", [], [{ total: 0 }]);
    const response = await injectMutation(
      route,
      { ...request, url: `/lists?owners=all&ownerIds=${otherOwnerId},${thirdOwnerId}&isPublic=false&includeTotal=true` },
      options,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, total: 0 } });
    const conditions = dbMock.calls.filter((call) => call.table === "user_lists").map((call) => call.clauses.where?.[0]);
    expect(conditions).toHaveLength(2);
    const condition = whereQuery("user_lists", "select");
    expect(condition.params).toEqual([otherOwnerId, thirdOwnerId]);
    expect(condition.sql).toContain("IS NOT TRUE");
  });

  it("keeps only public lists among the owner's own", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "user_lists", []);
    const response = await injectMutation(route, { ...request, url: "/lists?isPublic=true" }, options);
    expect(response.statusCode).toBe(200);
    expect(whereQuery("user_lists", "select").params).toEqual(expect.arrayContaining([ownerId, true]));
    expect(authBoundary.auth.api.userHasPermission).not.toHaveBeenCalled();
  });

  it("combines all three item filters within the owner's lists and counts the filtered result", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "user_lists", [], [{ total: 0 }]);
    const response = await injectMutation(
      route,
      { ...request, url: "/lists?stationIds=12,13&officialSiteIds=24&microwaveLinkIds=36&q=%25%5F&includeTotal=true" },
      options,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ paging: { total: 0 } });
    const condition = whereQuery("user_lists", "select");
    expect(condition.params).toEqual(expect.arrayContaining([ownerId, "[12]", "[13]", "[24]", "[36]", "%\\%\\_%"]));
    expect(condition.sql).toContain("or");
  });

  it("rejects malformed cursors without reading lists", async () => {
    getRuntimeSettings().enableUserLists = true;
    expectError(await injectMutation(route, { ...request, url: "/lists?cursor=malformed" }, options), 400, "INVALID_QUERY");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns FEATURE_DISABLED while lists are disabled", async () => {
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("requires an account after the feature is enabled", async () => {
    getRuntimeSettings().enableUserLists = true;
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the documented owner result", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "user_lists", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ id: "list-1", isOwner: true, notificationsEnabled: true }],
      paging: { limit: 50, nextCursor: null },
    });
  });
});
