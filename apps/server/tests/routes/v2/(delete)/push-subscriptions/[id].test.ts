import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/push-subscriptions/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DELETE /push-subscriptions/11111111-1111-4111-8111-111111111111", () => {
  it("rejects a request without an account before reading or writing data", async () => {
    const response = await injectMutation(route, { method: "DELETE", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the documented owner result", async () => {
    dbMock.enqueueFor("delete", "push_subscriptions", []);
    const response = await injectMutation(
      route,
      { method: "DELETE", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111" },
      { session: userSession(ownerId, "user") },
    );
    expect(response.statusCode).toBe(204);
    expect(whereQuery("push_subscriptions", "delete").params).toEqual(["11111111-1111-4111-8111-111111111111", ownerId]);
    expect(response.body).toBe("");
  });

  it("keeps deletion idempotent when the resource is absent", async () => {
    dbMock.enqueueFor("delete", "push_subscriptions", []);
    const response = await injectMutation(
      route,
      { method: "DELETE", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111?unexpected=true" },
      { session: userSession(ownerId, "user") },
    );
    expect(response.statusCode).toBe(204);
  });
});
