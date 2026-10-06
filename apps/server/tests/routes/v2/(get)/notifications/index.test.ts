import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(get)/notifications/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

describe("GET /notifications", () => {
  it.each([
    ["submission_approved", "submissionAccepted"],
    ["submission_rejected", "submissionRejected"],
    ["new_submission", "submissionCreated"],
    ["submission_photo_upload_failed", "submissionPhotoUploadFailed"],
    ["station_cells_changed", "stationCellsChanged"],
    ["station_photos_added", "stationPhotosAdded"],
    ["station_comment_approved", "stationCommentApproved"],
    ["station_uke_permit_added", "officialPermitsChanged"],
  ])("serializes %s with its documented type %s and stored details after site deletion", async (type, expectedType) => {
    const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const timestamp = new Date("2026-01-01T00:00:00Z");
    const notification = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: ownerId,
      type,
      title: "Stored notification",
      submissionId: null,
      stationId: null,
      ukeStationId: null,
      readAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      actionUrl: "/#map=16.00/52.1/21.2",
      metadata: {
        station_id: "OLD-SITE",
        station_operator_mnc: 260,
        count: 3.9,
        added: 4.9,
        removed: -1,
        updated: "invalid",
        reviewer_note: "Reason",
        permits_added: 2,
        permits_deleted: 1,
        uke_stations_added: 1,
        uke_station_deleted: true,
      },
    };
    dbMock.enqueueFor("select", "notifications", [{ notification, key: "1767225600000000" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "operators", [{ id: 7, mnc: 260, name: "Network" }]);
    const response = await injectMutation(route, { method: "GET", url: "/notifications" }, { session: userSession(ownerId) });
    expect(response.statusCode).toBe(200);
    const result = response.json().data[0];
    expect(result).toMatchObject({ type: expectedType, count: 3, isRead: false, readAt: null });
    expect(expectedType === "officialPermitsChanged" ? result.officialSite : result.station).toEqual({
      id: null,
      siteId: "OLD-SITE",
      operatorId: 7,
      location: { latitude: 52.1, longitude: 21.2 },
    });
    if (expectedType === "stationCellsChanged") expect(result.cells).toEqual({ added: 4, removed: 0, updated: 0 });
    if (expectedType === "officialPermitsChanged")
      expect(result).toMatchObject({ permits: { added: 2, removed: 1 }, officialSitesAdded: 1, isRemovedFromRegister: true });
    if (expectedType === "submissionAccepted" || expectedType === "submissionRejected")
      expect(result).toMatchObject({ reviewer: null, reviewNote: "Reason" });
  });

  it("returns an opaque next cursor for overflow and applies it to the next owner page", async () => {
    const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const timestamp = new Date("2026-01-01T00:00:00Z");
    const notification = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: ownerId,
      type: "station_photos_added",
      title: "Photo",
      submissionId: null,
      stationId: null,
      ukeStationId: null,
      readAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      actionUrl: null,
      metadata: null,
    };
    const second = { ...notification, id: "22222222-2222-4222-8222-222222222222" };
    dbMock.enqueueFor(
      "select",
      "notifications",
      [
        { notification, key: "1767225600000000" },
        { notification: second, key: "1767225600000000" },
      ],
      [],
    );
    dbMock.enqueueFor("select", "users", [{ role: "user" }], [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", [], []);
    const response = await injectMutation(route, { method: "GET", url: "/notifications?limit=1" }, { session: userSession(ownerId) });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    const cursor: string = response.json().paging.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    const next = await injectMutation(
      route,
      { method: "GET", url: `/notifications?limit=1&cursor=${encodeURIComponent(cursor)}` },
      { session: userSession(ownerId) },
    );
    expect(next.statusCode).toBe(200);
    const query = dbMock.calls.findLast((call) => call.table === "notifications");
    expect(query?.clauses.where?.[0]).toBeDefined();
    expect(next.json()).toEqual({ data: [], paging: { limit: 1, nextCursor: null } });
  });

  it("requires an account", async () => {
    const response = await injectMutation(route, { method: "GET", url: "/notifications" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["", "?isRead=true", "?isRead=false"])("returns an empty owner page with read filter %s", async (query) => {
    dbMock.enqueueFor("select", "notifications", []);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(
      route,
      { method: "GET", url: `/notifications${query}` },
      { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
    const condition = whereQuery("notifications", "select");
    expect(condition.params).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
    if (query === "?isRead=true") expect(condition.sql).toContain("is not null");
    if (query === "?isRead=false") expect(condition.sql).toContain("is null");
  });

  it("requires profile scope before accessing an OAuth user's notifications", async () => {
    const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expectError(
      await injectMutation(
        route,
        { method: "GET", url: "/notifications" },
        { session: userSession(ownerId), oauthToken: { userId: ownerId, clientId: "test-client", scopes: ["read:stations"] } },
      ),
      403,
      "INSUFFICIENT_PERMISSIONS",
    );
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects malformed cursors before reading or counting notifications", async () => {
    expectError(
      await injectMutation(
        route,
        { method: "GET", url: "/notifications?cursor=malformed&includeTotal=true" },
        { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") },
      ),
      400,
      "INVALID_QUERY",
    );
    expect(dbMock.calls).toEqual([]);
  });

  it("includes the filtered total when requested", async () => {
    dbMock.enqueueFor("select", "notifications", [], [{ total: 0 }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(
      route,
      { method: "GET", url: "/notifications?includeTotal=true" },
      { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ paging: { total: 0 } });
  });
});
