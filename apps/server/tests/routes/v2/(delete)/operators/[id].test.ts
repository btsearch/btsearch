import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/operators/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = {
  id: 7,
  countryCode: "PL",
  brandId: null,
  name: "Network",
  full_name: "Network Company",
  shortCode: null,
  sortPriority: null,
  mnc: null,
};
const request = { method: "DELETE" as const, url: "/operators/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /operators", () => {
  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_DELETE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented operator mutation", async () => {
    scriptAudit();
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    for (const table of ["stations", "uke_stations", "proposed_stations"]) dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("select", "operator_links", [], []);
    dbMock.enqueueFor("select", "plmns", []);
    dbMock.enqueueFor("select", "stats_snapshots", [{ value: 0 }]);
    dbMock.enqueueFor("delete", "operators", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
  });

  it("returns 404 for an absent operator", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it.each([
    { table: "stations", message: "Cannot delete an operator that still has stations" },
    { table: "uke_stations", message: "Cannot delete an operator that still has official sites and permits" },
    { table: "operator_links", message: "Cannot delete a shared network that still has member operators" },
    { table: "proposed_stations", message: "Cannot delete an operator that a pending submission still names" },
  ])("refuses deletion while $table refers to the operator", async ({ table, message }) => {
    scriptAudit();
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    for (const name of ["stations", "uke_stations", "proposed_stations"]) dbMock.enqueueFor("select", name, table === name ? [{ id: 1 }] : []);
    dbMock.enqueueFor("select", "operator_links", [], table === "operator_links" ? [{ id: 1 }] : []);
    dbMock.enqueueFor("select", "plmns", []);
    dbMock.enqueueFor("select", "stats_snapshots", [{ value: 0 }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", message);
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "operators")).toBe(false);
  });
});
