import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/role-grants/[id].js";
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
const request = { method: "DELETE" as const, url: "/role-grants/11111111-1111-4111-8111-111111111111" };
const options = { session: userSession(userId, "admin") };

describe("DELETE /role-grants", () => {
  it("reports a grant that disappeared between authorization and deletion", async () => {
    dbMock.enqueueFor("select", "role_grants", [row], []);
    scriptAudit();
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("returns a controlled deletion failure when the transaction rejects", async () => {
    dbMock.enqueueFor("select", "role_grants", [row]);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_DELETE");
  });

  it("rejects access without an authenticated actor", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request);
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("returns the documented grant result", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], [row], [{ id: "22222222-2222-4222-8222-222222222222" }]);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    dbMock.enqueueFor("delete", "role_grants", [{ id: grantId }]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });

  it("demotes an editor after their last grant is deleted", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "role_grants", [row], [row], []);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grant_regions", []);
    dbMock.enqueueFor("delete", "role_grants", [{ id: grantId }]);
    dbMock.enqueueFor("update", "users", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "users")?.values).toMatchObject({ role: "user" });
  });
});
