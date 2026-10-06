import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/structure-owners/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, name: "Tower Company", countryCode: null, brandId: null, operatorId: null };
const request = { method: "DELETE" as const, url: "/structure-owners/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /structure-owners", () => {
  it("applies and audits the documented owner mutation", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "locations", []);
    dbMock.enqueueFor("select", "proposed_locations", []);
    dbMock.enqueueFor("delete", "structure_owners", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
  });

  it("returns 404 when the owner does not exist", async () => {
    dbMock.query.structureOwners.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it.each([
    { table: "locations", message: "Cannot delete a structure owner that locations still use" },
    { table: "proposed_locations", message: "Cannot delete a structure owner that a pending submission still names" },
  ])("refuses deletion while $table refers to the owner", async ({ table, message }) => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "locations", table === "locations" ? [{ id: 1 }] : []);
    dbMock.enqueueFor("select", "proposed_locations", table === "proposed_locations" ? [{ id: 1 }] : []);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", message);
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "structure_owners")).toBe(false);
  });
});
