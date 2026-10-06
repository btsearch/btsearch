import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/brands/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, slug: "network", name: "Network", color: "#123456", logoFile: null, logoWidth: null, logoHeight: null };
const request = { method: "DELETE" as const, url: "/brands/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /brands/7", () => {
  it.each(["operators", "uke_operators", "structure_owners"])("rejects a brand still used by %s", async (reference) => {
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    scriptAudit();
    for (const table of ["operators", "uke_operators", "structure_owners"])
      dbMock.enqueueFor("select", table, table === reference ? [{ id: 1 }] : []);
    expectError(await injectMutation(route, request, options), 409, "CONFLICT", "Cannot delete a brand that operators or structure owners still use");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("returns 404 when another request already deleted the brand", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    scriptAudit();
    for (const table of ["operators", "uke_operators", "structure_owners"]) dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("delete", "brands", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.query.brands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", []);
    dbMock.enqueueFor("select", "uke_operators", []);
    dbMock.enqueueFor("select", "structure_owners", []);
    dbMock.enqueueFor("delete", "brands", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    const mutation = dbMock.calls.find((call) => call.operation === "delete" && call.table === "brands");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.body).toBe("");
  });

  it("returns 404 for a missing resource without writing an audit operation", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });
});
