import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/role-grants/index.js";
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
const request = { method: "POST" as const, url: "/role-grants", payload: { userId, role: "editor", countryCode: "PL", regionIds: null } };
const options = { session: userSession(userId, "admin") };

describe("POST /role-grants", () => {
  it("returns a controlled creation failure when the transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_CREATE");
  });

  it("creates a regional grant with sorted response regions while preserving the supplied membership", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "regions", [{ id: 2 }, { id: 1 }]);
    dbMock.enqueueFor("insert", "role_grants", [{ ...row, isCountryWide: false }]);
    dbMock.enqueueFor("delete", "role_grant_regions", []);
    dbMock.enqueueFor("insert", "role_grant_regions", []);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, regionIds: [2, 1] } }, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { countryCode: "PL", regionIds: [1, 2] } });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "role_grant_regions")?.values).toEqual([
      { grantId, regionId: 2 },
      { grantId, regionId: 1 },
    ]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "users")).toBe(false);
  });

  it("promotes an ordinary user and removes stale grants before creating their new grant", async () => {
    const stale = { ...row, id: "22222222-2222-4222-8222-222222222222", countryCode: "DE" };
    scriptAudit();
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "role_grants", [stale], []);
    dbMock.enqueueFor("select", "role_grant_regions", [{ grantId: stale.id, regionId: 3 }]);
    dbMock.enqueueFor("delete", "role_grants", []);
    dbMock.enqueueFor("insert", "role_grants", [row]);
    dbMock.enqueueFor("delete", "role_grant_regions", []);
    dbMock.enqueueFor("update", "users", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "users")?.values).toMatchObject({ role: "editor" });
    const auditWrites = dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs");
    expect(auditWrites).toHaveLength(2);
    expect(auditWrites[0]?.values).toMatchObject([{ entity: "role_grants", op: "delete", record_id: stale.id, metadata: { stale: true } }]);
    expect(auditWrites[1]?.values).toMatchObject([
      { entity: "role_grants", op: "create", metadata: { role_changed: { from: "user", to: "editor" } } },
    ]);
  });

  it("rejects a duplicate country and role grant without replacing its regions", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "role_grants", [{ id: grantId }]);
    expectError(await injectMutation(route, request, options), 409, "CONFLICT", "This user already has this grant for this country");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("requires the grant country to exist", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "countries", []);
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Country not found");
  });

  it.each([
    { countryCode: "DE", role: "editor", message: "Only a maintainer of this country or an administrator can manage its editors" },
    { countryCode: "PL", role: "maintainer", message: "Only an administrator can appoint or remove a maintainer" },
  ])("limits a maintainer managing grant %j", async ({ countryCode, role, message }) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "maintainer", isCountryWide: true, regionId: null }]);
    expectError(
      await injectMutation(route, { ...request, payload: { ...request.payload, countryCode, role } }, { session: userSession(userId, "editor") }),
      403,
      "INSUFFICIENT_PERMISSIONS",
      message,
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects access without an authenticated actor", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request);
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("returns the documented grant result", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("insert", "role_grants", [row]);
    dbMock.enqueueFor("delete", "role_grant_regions", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: grantId, role: "editor", countryCode: "PL", regionIds: null } });
  });

  it.each([
    [{ role: "admin" }, 409, "CONFLICT", "Administrators already have access everywhere"],
    [undefined, 400, "BAD_REQUEST", "User not found"],
  ])("rejects an ineligible grant user: %j", async (user, status, code, message) => {
    scriptAudit();
    dbMock.enqueueFor("select", "users", user === undefined ? [] : [user]);
    const response = await injectMutation(route, request, options);
    expectError(response, status, code, message);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "role_grants")).toBe(false);
  });

  it.each([{ regionIds: [] }, { regionIds: [1, 1] }, { regionIds: [0] }, { regionIds: [-1] }])(
    "rejects invalid region sets %j before database access",
    async ({ regionIds }) => {
      const response = await injectMutation(route, { ...request, payload: { ...request.payload, regionIds } }, options);
      expectError(response, 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("rejects limiting a maintainer to regions", async () => {
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, role: "maintainer", regionIds: [1] } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
  });
});
