import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/regions/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, countryCode: "PL", code: "MZ", name: "Mazowieckie", isoCode: null };
const request = { method: "DELETE" as const, url: "/regions/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /regions/7", () => {
  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_DELETE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it.each(["locations", "uke_locations", "proposed_locations", "role_grant_regions"])(
    "rejects a region still referenced by %s",
    async (reference) => {
      dbMock.query.regions.findFirst.mockResolvedValue(row);
      scriptAudit();
      for (const table of ["locations", "uke_locations", "proposed_locations", "role_grant_regions"])
        dbMock.enqueueFor("select", table, table === reference ? [{ id: 1, grantId: "grant" }] : []);
      expectError(
        await injectMutation(route, request, options),
        409,
        "CONFLICT",
        reference === "role_grant_regions"
          ? "Cannot delete a region that an editor grant is limited to"
          : "Cannot delete a region that still has locations",
      );
      expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
    },
  );

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    for (const table of ["locations", "uke_locations", "proposed_locations", "role_grant_regions"]) dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("delete", "regions", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    const mutation = dbMock.calls.find((call) => call.operation === "delete" && call.table === "regions");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.body).toBe("");
  });

  it("returns 404 for a missing resource without writing an audit operation", async () => {
    dbMock.query.regions.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });
});
