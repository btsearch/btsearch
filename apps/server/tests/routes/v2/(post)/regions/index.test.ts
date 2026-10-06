import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/regions/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, countryCode: "PL", code: "MZ", name: "Mazowieckie", isoCode: null };
const request = { method: "POST" as const, url: "/regions", payload: { countryCode: "PL", code: "MZ", name: "Mazowieckie" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /regions", () => {
  it("creates a region with an explicit globally unique ISO subdivision code", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "regions", [], []);
    dbMock.enqueueFor("insert", "regions", [{ ...row, isoCode: "PL-14" }]);
    expect((await injectMutation(route, { ...request, payload: { ...request.payload, isoCode: "PL-14" } }, options)).statusCode).toBe(201);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "regions")?.values).toMatchObject({ isoCode: "PL-14" });
  });

  it("rejects a duplicate regional code or name before inserting", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "regions", [{ id: 8 }]);
    expectError(await injectMutation(route, request, options), 409, "CONFLICT", "This country already has a region with this code or name");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "regions")).toBe(false);
  });

  it("rejects creating a region in an unknown country", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Country not found");
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "regions", []);
    dbMock.enqueueFor("insert", "regions", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    const mutation = dbMock.calls.find((call) => call.operation === "insert" && call.table === "regions");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toMatchObject({ data: { id: 7 } });
  });

  it("returns a creation failure when the database creates no record", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "regions", []);
    dbMock.enqueueFor("insert", "regions", []);
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });
});
