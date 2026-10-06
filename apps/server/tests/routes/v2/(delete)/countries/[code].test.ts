import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/countries/[code].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { code: "PL", isVisible: false, contributions: "closed", viewWest: null, viewSouth: null, viewEast: null, viewNorth: null };
const request = { method: "DELETE" as const, url: "/countries/PL" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /countries/PL", () => {
  it.each(["regions", "operators", "role_grants", "structure_owners"])("refuses deletion while the country still owns %s", async (reference) => {
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    scriptAudit();
    for (const table of ["regions", "operators", "role_grants", "structure_owners"])
      dbMock.enqueueFor("select", table, table === reference ? [{ id: 1 }] : []);
    expectError(
      await injectMutation(route, request, options),
      409,
      "CONFLICT",
      "Cannot delete a country that still has regions, operators, structure owners or editor grants",
    );
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    for (const table of ["regions", "operators", "role_grants", "structure_owners"]) dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("delete", "country_bands", []);
    dbMock.enqueueFor("delete", "contribution_snapshots", []);
    dbMock.enqueueFor("delete", "countries", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    const mutation = dbMock.calls.find((call) => call.operation === "delete" && call.table === "countries");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.body).toBe("");
  });

  it("returns 404 for a missing resource without writing an audit operation", async () => {
    dbMock.query.countries.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });
});
