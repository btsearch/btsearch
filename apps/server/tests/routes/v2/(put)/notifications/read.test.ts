import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(put)/notifications/read.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("PUT /notifications/read", () => {
  it("rejects a request without an account before reading or writing data", async () => {
    const response = await injectMutation(route, { method: "PUT", url: "/notifications/read" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("marks only the account's unread notifications as read", async () => {
    dbMock.enqueueFor("update", "notifications", []);
    const response = await injectMutation(route, { method: "PUT", url: "/notifications/read" }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    const condition = whereQuery("notifications", "update");
    expect(condition.params).toEqual([ownerId]);
    expect(condition.sql).toContain('"notifications"."readAt" is null');
    expect(dbMock.calls[0]?.values).toEqual({ readAt: expect.any(Date) });
  });

  it("leaves notifications that changed after the client snapshot unread", async () => {
    dbMock.enqueueFor("update", "notifications", []);
    const snapshot = "2026-01-01T12:34:56.789Z";
    const response = await injectMutation(
      route,
      { method: "PUT", url: `/notifications/read?updatedBefore=${snapshot}` },
      { session: userSession(ownerId) },
    );
    expect(response.statusCode).toBe(204);
    const condition = whereQuery("notifications", "update");
    expect(condition.params).toEqual([ownerId, snapshot]);
    expect(condition.sql).toContain("date_trunc('milliseconds'");
    expect(condition.sql).toContain("<=");
  });

  it("requires the profile scope for OAuth owners", async () => {
    const response = await injectMutation(
      route,
      { method: "PUT", url: "/notifications/read" },
      { session: userSession(ownerId), oauthToken: { userId: ownerId, clientId: "test-client", scopes: ["read:stations"] } },
    );
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects an invalid snapshot timestamp", async () => {
    expectError(
      await injectMutation(route, { method: "PUT", url: "/notifications/read?updatedBefore=yesterday" }, { session: userSession(ownerId) }),
      400,
      "VALIDATION_ERROR",
    );
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects unknown query fields before touching the database", async () => {
    const response = await injectMutation(
      route,
      { method: "PUT", url: "/notifications/read?unexpected=true" },
      { session: userSession(ownerId, "user") },
    );
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
