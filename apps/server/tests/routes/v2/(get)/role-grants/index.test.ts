import { describe, expect, it } from "vitest";

import { encodeCursor } from "../../../../../src/lib/cursor.js";
import route from "../../../../../src/routes/v2/(get)/role-grants/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const grantId = "11111111-1111-4111-8111-111111111111";
const row = {
  id: grantId,
  userId,
  countryCode: "PL",
  role: "editor",
  isCountryWide: true,
  grantedById: userId,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = { method: "GET" as const, url: "/role-grants" };
const options = { session: userSession(userId, "admin") };

describe("GET /role-grants", () => {
  it("filters a cursor page and includes deduplicated user references and sorted regional memberships", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "admin" }], [{ id: userId, username: "contributor", name: "Contributor", image: null }]);
    dbMock.enqueueFor(
      "select",
      "role_grants",
      [],
      [
        { ...row, isCountryWide: false },
        { ...row, id: "22222222-2222-4222-8222-222222222222" },
      ],
    );
    dbMock.enqueueFor("select", "role_grant_regions", [
      { grantId, regionId: 3 },
      { grantId, regionId: 1 },
    ]);
    const after = "00000000-0000-4000-8000-000000000000";
    const response = await injectMutation(
      route,
      { method: "GET", url: `/role-grants?userIds=${userId}&countryCodes=PL&include=user&limit=1&cursor=${encodeCursor({ id: after })}` },
      options,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ id: grantId, regionIds: [1, 3], user: { id: userId, username: "contributor", name: "Contributor" } }],
      paging: { limit: 1, nextCursor: encodeCursor({ id: grantId }) },
    });
    expect(whereQuery("role_grants", "select").params).toEqual([userId]);
    const filtered = dbMock.calls.findLast((call) => call.operation === "select" && call.table === "role_grants");
    expect(filtered?.clauses.where?.[0]).toBeDefined();
    expect(dbMock.calls.filter((call) => call.table === "users")).toHaveLength(2);
  });

  it("limits ordinary accounts and OAuth tokens without management consent to their own grants", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", [], []);
    const response = await injectMutation(route, request, {
      session: userSession(userId),
      oauthToken: { clientId: "client", userId, scopes: ["profile"] },
    });
    expect(response.statusCode).toBe(200);
    const last = dbMock.calls.findLast((call) => call.table === "role_grants");
    expect(last?.clauses.where).toBeDefined();
    expect(response.json()).toMatchObject({ data: [], paging: { nextCursor: null } });
  });

  it("allows maintainers to see their own grants and every grant in their maintained countries", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "maintainer", isCountryWide: true, regionId: null }], [row]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    const response = await injectMutation(route, request, { session: userSession(userId, "editor") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ id: grantId }] });
  });

  it("rejects a malformed cursor instead of starting a page query", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    expectError(await injectMutation(route, { ...request, url: "/role-grants?cursor=broken" }, options), 400, "INVALID_QUERY");
    expect(dbMock.calls.filter((call) => call.table === "role_grants")).toHaveLength(1);
  });

  it("rejects access without an authenticated actor", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
  });

  it("returns the documented grant result", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "role_grants", [row]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ id: grantId, regionIds: null }] });
  });
});
