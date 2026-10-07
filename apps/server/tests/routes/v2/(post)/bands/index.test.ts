import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/bands/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, rat: "LTE", code: "B3", name: "LTE 1800", value: 1800, duplex: "FDD", variant: "commercial" };
const request = { method: "POST" as const, url: "/bands", payload: { code: "B3", name: "LTE 1800" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /bands", () => {
  it("accepts an explicit railway variant and the upper frequency-label boundary", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [], []);
    dbMock.enqueueFor("insert", "bands", [{ ...row, value: 100000, variant: "railway" }]);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, labelMhz: 100000, variant: "railway" } }, options);
    expect(response.statusCode).toBe(201);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "bands")?.values).toMatchObject({
      value: 100000,
      variant: "railway",
    });
  });

  it("fails without auditing when insertion returns no band", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [], []);
    dbMock.enqueueFor("insert", "bands", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies the documented catalog or band-plan mutation", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [], []);
    dbMock.enqueueFor("insert", "bands", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: 7, rat: "lte", code: "B3", duplex: "fdd", labelMhz: 1800 } });
  });

  it("rejects an unknown catalog code", async () => {
    const response = await injectMutation(route, { ...request, payload: { code: "B99999", name: "Invalid" } }, options);
    expectError(response, 400, "BAD_REQUEST", "Unknown band code");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects a duplicate catalog identity before inserting the band", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [row]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", 'This band already exists as "LTE 1800"');
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "bands")).toBe(false);
  });
});
