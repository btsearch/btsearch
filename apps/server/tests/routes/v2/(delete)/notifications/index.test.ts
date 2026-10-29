import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/notifications/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DELETE /notifications", () => {
  it("rejects a request without an account before reading or writing data", async () => {
    const response = await injectMutation(route, { method: "DELETE", url: "/notifications" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("deletes only the account's notifications, read and unread", async () => {
    dbMock.enqueueFor("delete", "notifications", []);
    const response = await injectMutation(route, { method: "DELETE", url: "/notifications" }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    const condition = whereQuery("notifications", "delete");
    expect(condition.params).toEqual([ownerId]);
  });

  it("requires the profile scope for OAuth owners", async () => {
    const response = await injectMutation(
      route,
      { method: "DELETE", url: "/notifications" },
      { session: userSession(ownerId), oauthToken: { userId: ownerId, clientId: "test-client", scopes: ["read:stations"] } },
    );
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects query fields, so a filter that does not exist deletes nothing", async () => {
    const response = await injectMutation(route, { method: "DELETE", url: "/notifications?isRead=true" }, { session: userSession(ownerId, "user") });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
