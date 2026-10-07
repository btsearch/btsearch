import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/structure-owners/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, name: "Tower Company", countryCode: null, brandId: null, operatorId: null };
const request = { method: "POST" as const, url: "/structure-owners", payload: { name: "Tower Company" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /structure-owners", () => {
  it("creates a country-scoped owner with existing brand and operator references", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "brands", [{ id: 2 }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "structure_owners", [], []);
    const created = { ...row, countryCode: "PL", brandId: 2, operatorId: 3 };
    dbMock.enqueueFor("insert", "structure_owners", [created]);
    const response = await injectMutation(route, { ...request, payload: { name: row.name, countryCode: "PL", brandId: 2, operatorId: 3 } }, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ data: created });
  });

  it("fails without auditing when no owner record is inserted", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "structure_owners", []);
    dbMock.enqueueFor("insert", "structure_owners", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented owner mutation", async () => {
    scriptAudit();

    dbMock.enqueueFor("select", "structure_owners", []);
    dbMock.enqueueFor("insert", "structure_owners", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toEqual({ data: row });
  });

  it("rejects an ordinary user before creating a global owner", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(route, request, { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") });
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it.each([
    { payload: { name: "Tower Company", countryCode: "PL" }, table: "countries", message: "Country not found" },
    { payload: { name: "Tower Company", brandId: 1 }, table: "brands", message: "Brand not found" },
    { payload: { name: "Tower Company", operatorId: 1 }, table: "operators", message: "Operator not found" },
  ])("rejects a missing reference: $table", async ({ payload, table, message }) => {
    scriptAudit();
    dbMock.enqueueFor("select", table, []);
    const response = await injectMutation(route, { ...request, payload }, options);
    expectError(response, 400, "BAD_REQUEST", message);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });

  it("rejects an existing case-insensitive owner name", async () => {
    scriptAudit();

    dbMock.enqueueFor("select", "structure_owners", [{ id: 8 }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "A structure owner with this name and no country already exists");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });
});
