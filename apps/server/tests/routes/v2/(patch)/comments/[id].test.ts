import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/comments/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { commentRow, commentView, commenterId } from "../../../../helpers/commentFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const request = { method: "PATCH" as const, url: "/comments/11111111-1111-4111-8111-111111111111", payload: { content: "A meaningful comment" } };
const options = { session: userSession(commenterId) };

describe("PATCH /comments/:id", () => {
  it.each(["pending", "approved"])("lets a moderator approve a %s comment and notifies watchers only for a new approval", async (status) => {
    dbMock.query.stationComments.findFirst.mockResolvedValue({ ...commentRow, user_id: "other", status });
    dbMock.query.stations.findFirst.mockResolvedValue({ id: 12, station_id: "SITE-12", location: null });
    scriptAudit();
    dbMock.enqueueFor("update", "station_comments", [{ ...commentRow, status: "approved" }]);
    dbMock.enqueueFor("select", "station_comments", [{ ...commentView, status: "approved" }]);
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    const response = await injectMutation(route, { ...request, payload: { status: "approved" } }, { session: userSession(commenterId, "admin") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { status: "approved" } });
    expect(dbMock.query.stations.findFirst).toHaveBeenCalledTimes(status === "pending" ? 1 : 0);
    expect(dbMock.calls.filter((call) => call.table === "station_watches")).toHaveLength(status === "pending" ? 1 : 0);
  });

  it("reports a comment write returning no row", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue(commentRow);
    scriptAudit();
    dbMock.enqueueFor("update", "station_comments", []);
    expectError(await injectMutation(route, request, options), 500, "INTERNAL_SERVER_ERROR");
  });

  it("returns 404 if the comment disappears before the response is loaded", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue(commentRow);
    scriptAudit();
    dbMock.enqueueFor("update", "station_comments", [commentRow]);
    dbMock.enqueueFor("select", "station_comments", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("requires an account", async () => {
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
  });

  it("returns 404 when the comment is absent", async () => {
    dbMock.query.stationComments.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it("rejects changing someone else's comment without moderation permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue({ ...commentRow, user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FORBIDDEN");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("lets the author edit their comment while comments are disabled", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue(commentRow);
    scriptAudit();
    dbMock.enqueueFor("update", "station_comments", [commentRow]);
    dbMock.enqueueFor("select", "station_comments", [commentView]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { content: commentRow.content, status: "pending", author: { name: "Private Name" } } });
  });

  it("refuses an author assigning moderation status", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue(commentRow);
    const response = await injectMutation(route, { ...request, payload: { status: "approved" } }, options);
    expectError(response, 403, "FORBIDDEN");
  });

  it.each(["", " ", "a".repeat(1001)])("rejects invalid comment content before reading the comment", async (content) => {
    const response = await injectMutation(route, { ...request, payload: { content } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.query.stationComments.findFirst).not.toHaveBeenCalled();
  });
});
