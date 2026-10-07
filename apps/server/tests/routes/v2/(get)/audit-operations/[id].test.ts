import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(get)/audit-operations/[id].js";
import { scriptAuditDetail, scriptMaintainer } from "../../../../helpers/auditFixtures.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const request = { method: "GET" as const, url: "/audit-operations/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("GET /audit-operations/:id", () => {
  it("returns an operation with its entries and actual revertibility", async () => {
    scriptAuditDetail();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { id: 7, entries: [], isRevertible: false, revertsOperation: null, revertedByOperation: null, ipAddress: "192.0.2.1" },
    });
  });

  it("redacts client identifiers for a maintainer reading their own country", async () => {
    scriptMaintainer();
    scriptAuditDetail();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { countryCode: "PL", ipAddress: null, userAgent: null } });
  });

  it.each([null, "DE"])("hides an operation with country %s from a PL maintainer", async (country) => {
    scriptMaintainer();
    scriptAuditDetail(country);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("returns 404 for an operation that does not exist", async () => {
    dbMock.enqueueFor("select", "audit_operations", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("rejects unauthenticated readers", async () => {
    expectError(await injectMutation(route, request), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it.each(["0", "-1", "1.5", "text"])("rejects invalid operation id %s", async (id) => {
    expectError(await injectMutation(route, { ...request, url: `/audit-operations/${id}` }, options), 400, "VALIDATION_ERROR");
  });
});
