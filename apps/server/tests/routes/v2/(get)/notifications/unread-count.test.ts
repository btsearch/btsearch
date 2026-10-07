import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(get)/notifications/unread-count.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GET /notifications/unread-count", () => {
  it("returns zero when the unread count query has no aggregate row", async () => {
    dbMock.enqueueFor("select", "notifications", []);
    const response = await injectMutation(route, { method: "GET", url: "/notifications/unread-count" }, { session: userSession(ownerId) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { count: 0 } });
  });

  it("rejects a request without an account before reading or writing data", async () => {
    const response = await injectMutation(route, { method: "GET", url: "/notifications/unread-count" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the documented owner result", async () => {
    dbMock.enqueueFor("select", "notifications", [{ count: 4 }]);
    const response = await injectMutation(route, { method: "GET", url: "/notifications/unread-count" }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { count: 4 } });
  });

  it("rejects unknown query fields before touching the database", async () => {
    const response = await injectMutation(
      route,
      { method: "GET", url: "/notifications/unread-count?unexpected=true" },
      { session: userSession(ownerId, "user") },
    );
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
