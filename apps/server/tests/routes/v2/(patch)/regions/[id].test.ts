import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/regions/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, countryCode: "PL", code: "MZ", name: "Mazowieckie", isoCode: null };
const request = { method: "PATCH" as const, url: "/regions/7", payload: { name: "Mazowieckie" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PATCH /regions/7", () => {
  it.each([{ isoCode: null }, { isoCode: "PL-14" }])(
    "changes only the ISO code without checking an omitted regional code or name: %j",
    async ({ isoCode }) => {
      scriptAudit();
      dbMock.query.regions.findFirst.mockResolvedValue(row);
      if (isoCode !== null) dbMock.enqueueFor("select", "regions", []);
      dbMock.enqueueFor("update", "regions", [{ ...row, isoCode }]);
      expect((await injectMutation(route, { ...request, payload: { isoCode } }, options)).statusCode).toBe(200);
      expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "regions")?.values).toMatchObject({
        isoCode,
        code: undefined,
        name: undefined,
      });
    },
  );

  it("rejects an ISO code from a different country before writing", async () => {
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    expectError(await injectMutation(route, { ...request, payload: { isoCode: "DE-BE" } }, options), 400, "BAD_REQUEST");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a regional code already used within the same country", async () => {
    scriptAudit();
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "regions", [{ id: 8 }]);
    expectError(
      await injectMutation(route, { ...request, payload: { code: "LD" } }, options),
      409,
      "CONFLICT",
      "This country already has a region with this code or name",
    );
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "regions")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "regions", []);
    dbMock.enqueueFor("update", "regions", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    const mutation = dbMock.calls.find((call) => call.operation === "update" && call.table === "regions");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toMatchObject({ data: { id: 7 } });
  });

  it("returns 404 for a missing resource without writing an audit operation", async () => {
    dbMock.query.regions.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it("does not audit an update that returns no record", async () => {
    scriptAudit();
    dbMock.query.regions.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "regions", []);
    dbMock.enqueueFor("update", "regions", []);
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
