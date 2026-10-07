import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/operators/index.js";
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
const request = { method: "POST" as const, url: "/operators", payload: { countryCode: "PL", name: "Network", legalName: "Network Company" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /operators", () => {
  it("applies and audits the documented operator mutation", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "operators", []);
    dbMock.enqueueFor("insert", "operators", [row]);
    dbMock.enqueueFor("delete", "plmns", []);
    dbMock.enqueueFor("update", "plmns", []);
    dbMock.enqueueFor("delete", "operator_links", []);
    dbMock.enqueueFor("select", "plmns", []);
    dbMock.enqueueFor("select", "operator_links", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: 7, primaryPlmn: null, plmns: [], links: [] } });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
  });

  it("rejects a missing country before inserting an operator", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, request, options);
    expectError(response, 400, "BAD_REQUEST", "Country not found");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "operators")).toBe(false);
  });

  it("rejects an operator name already used in this country", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "operators", [{ id: 8 }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "This country already has an operator with this name");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "operators")).toBe(false);
  });
});
