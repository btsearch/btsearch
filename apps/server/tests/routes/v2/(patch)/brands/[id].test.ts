import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/brands/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, slug: "network", name: "Network", color: "#123456", logoFile: null, logoWidth: null, logoHeight: null };
const request = { method: "PATCH" as const, url: "/brands/7", payload: { name: "Network" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PATCH /brands/7", () => {
  it("checks a replacement slug for uniqueness before saving it", async () => {
    scriptAudit();
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "brands", []);
    dbMock.enqueueFor("update", "brands", [{ ...row, slug: "renamed" }]);
    expect((await injectMutation(route, { ...request, payload: { slug: "renamed" } }, options)).statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "brands")?.values).toMatchObject({
      slug: "renamed",
      name: undefined,
      color: undefined,
    });
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "brands", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    const mutation = dbMock.calls.find((call) => call.operation === "update" && call.table === "brands");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toMatchObject({ data: { id: 7 } });
  });

  it("returns 404 for a missing resource without writing an audit operation", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it("does not audit an update that returns no record", async () => {
    scriptAudit();
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "brands", []);
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it("rejects an empty patch before database access", async () => {
    const response = await injectMutation(route, { ...request, payload: {} }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
