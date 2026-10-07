import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/role-grants/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

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
const request = { method: "PATCH" as const, url: "/role-grants/11111111-1111-4111-8111-111111111111", payload: { regionIds: null } };
const options = { session: userSession(userId, "admin") };

describe("PATCH /role-grants", () => {
  it("returns a controlled update failure when the transaction rejects", async () => {
    dbMock.enqueueFor("select", "role_grants", [row]);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
  });

  it("returns 404 when the grant is absent before authorization", async () => {
    dbMock.enqueueFor("select", "role_grants", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 if the grant disappears before its transaction lock", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("replaces all region memberships when narrowing a country-wide editor grant", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], [row]);
    dbMock.enqueueFor("select", "regions", [{ id: 2 }, { id: 1 }]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    dbMock.enqueueFor("update", "role_grants", [{ ...row, isCountryWide: false }]);
    dbMock.enqueueFor("delete", "role_grant_regions", []);
    dbMock.enqueueFor("insert", "role_grant_regions", []);
    const response = await injectMutation(route, { ...request, payload: { regionIds: [2, 1] } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { userId, role: "editor", countryCode: "PL", regionIds: [1, 2] } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "role_grants")?.values).toMatchObject({ isCountryWide: false });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "role_grant_regions")?.values).toEqual([
      { grantId, regionId: 2 },
      { grantId, regionId: 1 },
    ]);
  });

  it("reports an update that did not return a grant", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], [row]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    dbMock.enqueueFor("update", "role_grants", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "role_grant_regions")).toBe(false);
  });

  it("rejects access without an authenticated actor", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request);
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("returns the documented grant result", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], [row]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    dbMock.enqueueFor("update", "role_grants", [row]);
    dbMock.enqueueFor("delete", "role_grant_regions", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: grantId, role: "editor", countryCode: "PL", regionIds: null } });
  });

  it("rejects limiting an existing maintainer to regions", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [{ ...row, role: "maintainer" }], [{ ...row, role: "maintainer" }]);
    const response = await injectMutation(route, { ...request, payload: { regionIds: [1] } }, options);
    expectError(response, 400, "BAD_REQUEST", "A maintainer grant covers the whole country");
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "role_grants")).toBe(false);
  });

  it("rejects regions outside the grant's country without updating membership", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], [row]);
    dbMock.enqueueFor("select", "regions", []);
    const response = await injectMutation(route, { ...request, payload: { regionIds: [1] } }, options);
    expectError(response, 400, "BAD_REQUEST", "Every region must belong to the grant's country");
  });
});
