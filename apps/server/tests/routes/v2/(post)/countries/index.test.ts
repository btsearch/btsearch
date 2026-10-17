import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/countries/index.js";
import { dbMock, redisMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = {
  code: "PL",
  isVisible: false,
  contributions: "closed",
  structureOwnerProposals: true,
  psc: false,
  bsic: false,
  viewWest: null,
  viewSouth: null,
  viewEast: null,
  viewNorth: null,
};
const request = { method: "POST" as const, url: "/countries", payload: { code: "PL" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

function scriptSourceCapabilities() {
  dbMock.enqueueFor("select", "countries", []);
  dbMock.enqueueFor("select", "official.sources", []);
}

describe("POST /countries", () => {
  it("rejects an existing country without creating a second band plan", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    expectError(await injectMutation(route, request, options), 409, "CONFLICT", "This country already exists");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "countries")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("insert", "countries", [row]);
    scriptSourceCapabilities();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    const mutation = dbMock.calls.find((call) => call.operation === "insert" && call.table === "countries");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toMatchObject({ data: { code: "PL" } });
    expect(response.json().data.features).toEqual({ structureOwnerProposals: true, psc: false, bsic: false });
    expect(redisMock.del).toHaveBeenCalledWith("countries:v2:visibility");
    expect(redisMock.del.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...dbMock.insert.mock.invocationCallOrder));
  });

  it("accepts country-specific feature values during creation", async () => {
    const features = { structureOwnerProposals: false, psc: true, bsic: false };
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("insert", "countries", [{ ...row, ...features }]);
    scriptSourceCapabilities();
    const response = await injectMutation(route, { ...request, payload: { code: "PL", features } }, options);
    expect(response.statusCode).toBe(201);
    expect(response.json().data.features).toEqual(features);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "countries")?.values).toMatchObject(features);
  });

  it("returns a creation failure when the database creates no record", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("insert", "countries", []);
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
    expect(redisMock.del).not.toHaveBeenCalled();
  });
});
