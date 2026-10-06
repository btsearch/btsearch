import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/structure-owners/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, name: "Tower Company", countryCode: null, brandId: null, operatorId: null };
const request = { method: "PATCH" as const, url: "/structure-owners/7", payload: { name: "Tower Company" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PATCH /structure-owners", () => {
  it("clears related country, brand and operator fields while preserving the omitted name", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue({ ...row, countryCode: "PL", brandId: 2, operatorId: 3 });
    dbMock.enqueueFor("select", "structure_owners", []);
    dbMock.enqueueFor("update", "structure_owners", [row]);
    const response = await injectMutation(route, { ...request, payload: { countryCode: null, brandId: null, operatorId: null } }, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "structure_owners")?.values).toMatchObject({
      name: undefined,
      countryCode: null,
      brandId: null,
      operatorId: null,
    });
  });

  it("validates every supplied reference when attaching a global owner to a country", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "locations", []);
    dbMock.enqueueFor("select", "brands", [{ id: 2 }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "structure_owners", [], []);
    const updated = { ...row, countryCode: "PL", brandId: 2, operatorId: 3 };
    dbMock.enqueueFor("update", "structure_owners", [updated]);
    const response = await injectMutation(route, { ...request, payload: { countryCode: "PL", brandId: 2, operatorId: 3 } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: updated });
  });

  it("refuses narrowing an owner to a country while locations elsewhere still use it", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "locations", [{ id: 99 }]);
    expectError(
      await injectMutation(route, { ...request, payload: { countryCode: "PL" } }, options),
      409,
      "CONFLICT",
      "Cannot set a country on a structure owner that locations in other countries still use",
    );
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "structure_owners")).toBe(false);
  });

  it("fails without auditing when saving returns no owner", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "structure_owners", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented owner mutation", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "structure_owners", []);
    dbMock.enqueueFor("update", "structure_owners", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toEqual({ data: row });
  });

  it("returns 404 when the owner does not exist", async () => {
    dbMock.query.structureOwners.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects an existing case-insensitive owner name", async () => {
    scriptAudit();
    dbMock.query.structureOwners.findFirst.mockResolvedValue({ ...row, name: "Previous" });
    dbMock.enqueueFor("select", "structure_owners", [{ id: 8 }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "A structure owner with this name and no country already exists");
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "structure_owners")).toBe(false);
  });
});
