import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/notifications/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const id = "11111111-1111-4111-8111-111111111111";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DELETE /notifications/:id", () => {
  it("rejects a request without an account before reading or writing data", async () => {
    const response = await injectMutation(route, { method: "DELETE", url: `/notifications/${id}` });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("deletes only the account's own notification", async () => {
    dbMock.enqueueFor("delete", "notifications", []);
    const response = await injectMutation(route, { method: "DELETE", url: `/notifications/${id}` }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(204);
    expect(whereQuery("notifications", "delete").params).toEqual([id, ownerId]);
    expect(response.body).toBe("");
  });

  it("requires the profile scope for OAuth owners", async () => {
    const response = await injectMutation(
      route,
      { method: "DELETE", url: `/notifications/${id}` },
      { session: userSession(ownerId), oauthToken: { userId: ownerId, clientId: "test-client", scopes: ["read:stations"] } },
    );
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects an id that is not a uuid before touching the database", async () => {
    const response = await injectMutation(route, { method: "DELETE", url: "/notifications/12" }, { session: userSession(ownerId) });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
